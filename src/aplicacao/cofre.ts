import type { ArmazemLocal } from '../armazenamento/cifrado.ts';
import { bytesAleatorios, deBase64, paraBase64 } from '../cripto/base64.ts';
import {
  derivarChaveDeBiometria,
  derivarChaveDeSegredo,
  desembrulharDek,
  embrulharDek,
  ErroDeCriptografia,
  gerarDek,
  ITERACOES_PBKDF2,
  novoSalt,
  type Embrulho,
} from '../cripto/chaves.ts';
import { fraseCanonica, validarFrase } from '../cripto/frase.ts';
import { criarPasskey, obterSegredoBiometria, type Credenciais } from '../cripto/passkey.ts';
import { TENTATIVAS_MAXIMAS, validarPin } from '../cripto/pin.ts';

/**
 * Parâmetros do cofre. Não têm segredo em claro: a DEK está embrulhada pela frase-mestra.
 * Na Fase 3 este mesmo objeto vai para a aba "meta" da planilha.
 */
export interface MetaCofre {
  readonly versao: 1;
  readonly kdf: 'PBKDF2-SHA256';
  readonly iteracoes: number;
  readonly salt: string;
  readonly dek: Embrulho;
  readonly criadoEm: string;
}

/** Como ESTE aparelho abre o app no dia a dia (a DEK embrulhada pela biometria ou pelo PIN). */
export type Desbloqueio =
  | {
      readonly metodo: 'biometria';
      readonly idCredencial: string;
      readonly salPrf: string;
      readonly saltHkdf: string;
      readonly dek: Embrulho;
    }
  | { readonly metodo: 'pin'; readonly salt: string; readonly iteracoes: number; readonly dek: Embrulho };

export type MetodoDesbloqueio = Desbloqueio['metodo'];

const CHAVE_COFRE = 'cofre';
const CHAVE_DESBLOQUEIO = 'desbloqueio';
const CHAVE_TENTATIVAS = 'tentativasPin';

export type ResultadoPin =
  | { readonly ok: true; readonly dek: CryptoKey }
  | { readonly ok: false; readonly motivo: 'pin-errado'; readonly restantes: number }
  | { readonly ok: false; readonly motivo: 'bloqueado' };

export type ResultadoFraseDigitada =
  | { readonly ok: true; readonly dek: CryptoKey }
  | { readonly ok: false; readonly motivo: 'invalida'; readonly mensagem: string }
  | { readonly ok: false; readonly motivo: 'nao-confere' };

function ehMetaCofre(x: unknown): x is MetaCofre {
  const m = x as Partial<MetaCofre> | null;
  return (
    typeof m === 'object' && m !== null && m.versao === 1 && m.kdf === 'PBKDF2-SHA256' &&
    typeof m.iteracoes === 'number' && typeof m.salt === 'string' && typeof m.dek?.iv === 'string' &&
    typeof m.dek.dados === 'string'
  );
}

function ehDesbloqueio(x: unknown): x is Desbloqueio {
  const d = x as Record<string, unknown> | null;
  if (typeof d !== 'object' || d === null) return false;
  const dek = d['dek'] as Record<string, unknown> | undefined;
  if (typeof dek?.['iv'] !== 'string' || typeof dek['dados'] !== 'string') return false;
  if (d['metodo'] === 'pin') return typeof d['salt'] === 'string' && typeof d['iteracoes'] === 'number';
  if (d['metodo'] === 'biometria') {
    return typeof d['idCredencial'] === 'string' && typeof d['salPrf'] === 'string' && typeof d['saltHkdf'] === 'string';
  }
  return false;
}

function lerJson(texto: string | undefined): unknown {
  if (texto === undefined) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

export interface OpcoesCofre {
  /** Só os testes usam menos; o padrão é o da especificação (≥ 600.000). */
  readonly iteracoes?: number;
  readonly credenciais?: Credenciais;
}

/**
 * O cofre guarda e abre a DEK (especificação 5.2 a 5.4). Nunca guarda a frase-mestra nem o PIN.
 */
export class Cofre {
  private readonly iteracoes: number;

  constructor(
    private readonly armazem: ArmazemLocal,
    private readonly opcoes: OpcoesCofre = {},
  ) {
    this.iteracoes = opcoes.iteracoes ?? ITERACOES_PBKDF2;
  }

  async meta(): Promise<MetaCofre | null> {
    const m = lerJson(await this.armazem.lerMeta(CHAVE_COFRE));
    return ehMetaCofre(m) ? m : null;
  }

  async existe(): Promise<boolean> {
    return (await this.meta()) !== null;
  }

  async desbloqueio(): Promise<Desbloqueio | null> {
    const d = lerJson(await this.armazem.lerMeta(CHAVE_DESBLOQUEIO));
    return ehDesbloqueio(d) ? d : null;
  }

  async metodo(): Promise<MetodoDesbloqueio | null> {
    return (await this.desbloqueio())?.metodo ?? null;
  }

  async tentativasRestantes(): Promise<number> {
    const usadas = Number(await this.armazem.lerMeta(CHAVE_TENTATIVAS)) || 0;
    return Math.max(0, TENTATIVAS_MAXIMAS - usadas);
  }

  /** Cria o cofre a partir da frase recém-gerada. Devolve a DEK, já aberta. */
  async criar(palavras: readonly string[]): Promise<CryptoKey> {
    const dek = await gerarDek();
    await this.gravarMetaDaFrase(dek, palavras);
    return dek;
  }

  /** Grava a DEK embrulhada por uma frase (criação ou troca de frase). */
  private async gravarMetaDaFrase(dek: CryptoKey, palavras: readonly string[]): Promise<void> {
    const salt = novoSalt();
    const kek = await derivarChaveDeSegredo(fraseCanonica(palavras), deBase64(salt), this.iteracoes);
    const meta: MetaCofre = {
      versao: 1,
      kdf: 'PBKDF2-SHA256',
      iteracoes: this.iteracoes,
      salt,
      dek: await embrulharDek(dek, kek, 'frase'),
      criadoEm: new Date().toISOString(),
    };
    await this.armazem.gravarMeta(CHAVE_COFRE, JSON.stringify(meta));
  }

  /** Abre a DEK com a frase-mestra (aparelho novo, depois de 10 PINs errados, recuperação). */
  async abrirComFrase(texto: string): Promise<ResultadoFraseDigitada> {
    const v = validarFrase(texto);
    if (!v.ok) {
      return {
        ok: false,
        motivo: 'invalida',
        mensagem:
          v.erro === 'quantidade'
            ? `A frase tem 7 palavras (você digitou ${String(v.encontradas)}).`
            : `A palavra ${String(v.posicao)} ("${v.digitada}") não está na lista.`,
      };
    }
    const meta = await this.meta();
    if (!meta) return { ok: false, motivo: 'nao-confere' };
    try {
      const kek = await derivarChaveDeSegredo(fraseCanonica(v.palavras), deBase64(meta.salt), meta.iteracoes);
      const dek = await desembrulharDek(meta.dek, kek, 'frase');
      await this.armazem.gravarMeta(CHAVE_TENTATIVAS, '0');
      return { ok: true, dek };
    } catch (e) {
      if (e instanceof ErroDeCriptografia) return { ok: false, motivo: 'nao-confere' };
      throw e;
    }
  }

  /** Troca a frase: exige a atual e só re-embrulha a DEK (os dados não mudam). */
  async trocarFrase(fraseAtual: string, novasPalavras: readonly string[]): Promise<ResultadoFraseDigitada> {
    const r = await this.abrirComFrase(fraseAtual);
    if (!r.ok) return r;
    await this.gravarMetaDaFrase(r.dek, novasPalavras);
    return r;
  }

  /** Define o PIN deste aparelho (substitui a biometria, se houver). */
  async configurarPin(dek: CryptoKey, pin: string): Promise<void> {
    const erro = validarPin(pin);
    if (erro) throw new Error(erro);
    const salt = novoSalt();
    const chave = await derivarChaveDeSegredo(pin, deBase64(salt), this.iteracoes);
    const d: Desbloqueio = { metodo: 'pin', salt, iteracoes: this.iteracoes, dek: await embrulharDek(dek, chave, 'pin') };
    await this.armazem.gravarMeta(CHAVE_DESBLOQUEIO, JSON.stringify(d));
    await this.armazem.gravarMeta(CHAVE_TENTATIVAS, '0');
  }

  /** Cria a passkey e passa a abrir com a digital/rosto (substitui o PIN, se houver). */
  async configurarBiometria(dek: CryptoKey, nomePessoa: string): Promise<void> {
    const credenciais = this.credenciais();
    const { idCredencial } = await criarPasskey(credenciais, nomePessoa);
    const salPrf = bytesAleatorios(32);
    const saltHkdf = bytesAleatorios(16);
    const segredo = await obterSegredoBiometria(credenciais, idCredencial, salPrf);
    const chave = await derivarChaveDeBiometria(segredo, saltHkdf);
    const d: Desbloqueio = {
      metodo: 'biometria',
      idCredencial: paraBase64(idCredencial),
      salPrf: paraBase64(salPrf),
      saltHkdf: paraBase64(saltHkdf),
      dek: await embrulharDek(dek, chave, 'biometria'),
    };
    await this.armazem.gravarMeta(CHAVE_DESBLOQUEIO, JSON.stringify(d));
    await this.armazem.gravarMeta(CHAVE_TENTATIVAS, '0');
  }

  async abrirComBiometria(): Promise<CryptoKey> {
    const d = await this.desbloqueio();
    if (d?.metodo !== 'biometria') throw new Error('Biometria não configurada neste aparelho.');
    const segredo = await obterSegredoBiometria(this.credenciais(), deBase64(d.idCredencial), deBase64(d.salPrf));
    return desembrulharDek(d.dek, await derivarChaveDeBiometria(segredo, deBase64(d.saltHkdf)), 'biometria');
  }

  /**
   * Abre com o PIN. Depois de 10 erros seguidos, apaga a DEK guardada neste aparelho: a partir
   * daí só a frase-mestra abre (especificação 5.4).
   */
  async abrirComPin(pin: string): Promise<ResultadoPin> {
    const d = await this.desbloqueio();
    if (d?.metodo !== 'pin') return { ok: false, motivo: 'bloqueado' };
    try {
      const chave = await derivarChaveDeSegredo(pin, deBase64(d.salt), d.iteracoes);
      const dek = await desembrulharDek(d.dek, chave, 'pin');
      await this.armazem.gravarMeta(CHAVE_TENTATIVAS, '0');
      return { ok: true, dek };
    } catch (e) {
      if (!(e instanceof ErroDeCriptografia)) throw e;
      const restantes = (await this.tentativasRestantes()) - 1;
      if (restantes <= 0) {
        await this.esquecerDesbloqueio();
        return { ok: false, motivo: 'bloqueado' };
      }
      await this.armazem.gravarMeta(CHAVE_TENTATIVAS, String(TENTATIVAS_MAXIMAS - restantes));
      return { ok: false, motivo: 'pin-errado', restantes };
    }
  }

  /** Apaga a DEK guardada neste aparelho (biometria/PIN). Só a frase abre depois disso. */
  async esquecerDesbloqueio(): Promise<void> {
    await this.armazem.apagarMeta(CHAVE_DESBLOQUEIO);
    await this.armazem.apagarMeta(CHAVE_TENTATIVAS);
  }

  private credenciais(): Credenciais {
    const c = this.opcoes.credenciais ?? (typeof navigator !== 'undefined' ? navigator.credentials : undefined);
    if (!c) throw new Error('Biometria indisponível neste navegador.');
    return c;
  }
}
