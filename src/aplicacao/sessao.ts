import { RepositorioCifrado, type ArmazemLocal } from '../armazenamento/cifrado.ts';
import type { RepositorioLocal } from '../armazenamento/local.ts';
import { criarCategoriasIniciais } from '../dominio/categorias.ts';
import { definirEmails, definirNomes, pessoaDoEmail } from '../dominio/config.ts';
import { nomeDe } from '../dominio/estado.ts';
import { gerarRecorrentesPendentes } from '../dominio/recorrentes.ts';
import type { Pessoa, PontosBase } from '../dominio/tipos.ts';
import type { Cofre, MetaCofre, MetodoDesbloqueio, ResultadoFraseDigitada } from './cofre.ts';
import { semearDemonstracao } from './demo.ts';
import { Loja } from './loja.ts';
import type { PlanilhaDoCasal, ServicoRemoto } from './servicoRemoto.ts';
import { Sincronizador } from './sincronizacao.ts';

/**
 * Bloqueio automático depois de 1 hora sem uso — em segundo plano, fechado ou recarregado
 * (especificação 5.4, decisão do dono). Dentro desse prazo o app reabre sem pedir a digital.
 */
export const BLOQUEIO_AUTOMATICO_MS = 60 * 60 * 1000;

/** De quanto em quanto tempo o prazo é renovado enquanto o app está na tela. */
export const RENOVACAO_MS = 5 * 60 * 1000;

export type EstadoSessao =
  | { readonly fase: 'iniciando' }
  | { readonly fase: 'boas-vindas' }
  | { readonly fase: 'bloqueado'; readonly metodo: MetodoDesbloqueio | null }
  | {
      readonly fase: 'aberto';
      readonly loja: Loja;
      readonly modo: 'real' | 'demo';
      /** Sincronização com a planilha (null = cofre só deste aparelho ou demonstração). */
      readonly sync: Sincronizador | null;
    };

export interface DadosIniciais {
  readonly nomeA: string;
  readonly nomeB: string;
  readonly euSou: Pessoa;
  /** % da Pessoa A nas categorias proporcionais. */
  readonly pctProporcional: PontosBase;
  /** E-mails Google autorizados (quando há planilha). */
  readonly emailA?: string;
  readonly emailB?: string;
}

export interface DependenciasSessao {
  /** Banco do modo real (só dados criptografados). */
  readonly armazem: ArmazemLocal;
  readonly cofre: Cofre;
  /** Banco do modo demonstração (dados fictícios, sem criptografia). */
  readonly repositorioDemo: RepositorioLocal;
  /** Google (null quando o app não foi configurado para ele). */
  readonly remoto?: ServicoRemoto | null;
  /** Onde ligar os gatilhos da sincronização (ausentes nos testes). */
  readonly janela?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly documento?: Pick<Document, 'visibilityState'>;
  readonly agora?: () => number;
}

const CHAVE_MODO = 'modo';
export const CHAVE_PLANILHA = 'planilhaId';

export class ContaNaoAutorizada extends Error {
  constructor(email: string) {
    super(`A conta ${email} não está autorizada neste cofre. Entre com a conta Google combinada.`);
    this.name = 'ContaNaoAutorizada';
  }
}

/**
 * Controla em que "fase" o app está: boas-vindas, bloqueado ou aberto (real ou demonstração),
 * e liga a sincronização com a planilha quando o cofre tem uma.
 * A DEK só existe enquanto o app está aberto; bloquear descarta a Loja, e com ela a chave.
 */
export class Sessao {
  private estado: EstadoSessao = { fase: 'iniciando' };
  private ouvintes = new Set<() => void>();
  private escondidoDesde: number | null = null;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private readonly agora: () => number;
  /** A DEK aberta (só enquanto desbloqueado), para trocar PIN/biometria sem pedir a frase. */
  private dek: CryptoKey | null = null;
  private pararSync: (() => void) | null = null;
  private planilha: PlanilhaDoCasal | null = null;
  private avisoInicial: string | null = null;

  constructor(private readonly deps: DependenciasSessao) {
    this.agora = deps.agora ?? (() => Date.now());
  }

  get cofre(): Cofre {
    return this.deps.cofre;
  }

  /** O Google, se o app estiver configurado para ele. */
  get remoto(): ServicoRemoto | null {
    return this.deps.remoto ?? null;
  }

  /** Endereço da planilha (para "Abrir a planilha" nas configurações). */
  get enderecoPlanilha(): string | null {
    return this.planilha?.endereco ?? null;
  }

  async iniciar(): Promise<void> {
    if (await this.deps.cofre.existe()) {
      // Usado há menos de 1 hora? Reabre sem pedir a digital.
      const dek = await this.deps.cofre.abrirSessaoGuardada(this.agora());
      if (dek) await this.abrir(dek);
      else await this.irParaBloqueado();
      return;
    }
    if ((await this.deps.armazem.lerMeta(CHAVE_MODO)) === 'demo') {
      await this.entrarDemo();
      return;
    }
    this.mudar({ fase: 'boas-vindas' });
  }

  async entrarDemo(): Promise<void> {
    await this.deps.armazem.gravarMeta(CHAVE_MODO, 'demo');
    const loja = new Loja(this.deps.repositorioDemo);
    await loja.iniciar((l) => {
      semearDemonstracao(l);
    });
    this.mudar({ fase: 'aberto', loja, modo: 'demo', sync: null });
  }

  /** Sai da demonstração (os dados fictícios ficam guardados à parte). */
  async sairDemo(): Promise<void> {
    await this.deps.armazem.apagarMeta(CHAVE_MODO);
    this.mudar({ fase: 'boas-vindas' });
  }

  // --- Criação (1ª pessoa) ---

  /**
   * Depois de criar o cofre e o desbloqueio: grava nomes, e-mails e categorias, liga a
   * sincronização (se houver planilha) e abre o app.
   */
  async concluirCriacao(dek: CryptoKey, dados: DadosIniciais, planilhaId?: string): Promise<void> {
    await this.deps.armazem.apagarMeta(CHAVE_MODO);
    if (planilhaId) await this.deps.armazem.gravarMeta(CHAVE_PLANILHA, planilhaId);
    const loja = new Loja(new RepositorioCifrado(this.deps.armazem, dek));
    await loja.iniciar();
    await loja.definirEuSou(dados.euSou);
    const nomes = loja.executar((e, ctx) => definirNomes(e, dados.nomeA, dados.nomeB, ctx));
    if (!nomes.ok) throw new Error(nomes.erro === 'invalido' ? nomes.mensagem : 'Não foi possível salvar os nomes.');
    if (dados.emailA && dados.emailB) {
      const { emailA, emailB } = dados;
      const emails = loja.executar((e, ctx) => definirEmails(e, emailA, emailB, ctx));
      if (!emails.ok) throw new Error(emails.erro === 'invalido' ? emails.mensagem : 'Não foi possível salvar os e-mails.');
    }
    loja.executar((_, ctx) => criarCategoriasIniciais(dados.pctProporcional, ctx));
    await loja.aguardarGravacao();
    await this.abrirLoja(loja, dek);
  }

  // --- Entrada num cofre que já existe (2ª pessoa ou celular novo) ---

  /** Lê os parâmetros do cofre na planilha escolhida. */
  async lerCofreDaPlanilha(planilhaId: string): Promise<MetaCofre> {
    const remoto = this.exigirRemoto();
    const meta = await remoto.abrirPlanilha(planilhaId).lerMetaCofre();
    if (!meta) throw new Error('Essa planilha não é um cofre do Viver Gasta.');
    return meta;
  }

  /** Confere a frase contra os parâmetros da planilha (nada é gravado). */
  conferirFrase(meta: MetaCofre, frase: string): Promise<ResultadoFraseDigitada> {
    return this.deps.cofre.conferirFrase(meta, frase);
  }

  /**
   * Entra no cofre: baixa tudo da planilha, confere se o e-mail da conta está autorizado e
   * descobre quem é quem. Se a conta não for autorizada, apaga o que baixou.
   * Chamar DEPOIS de configurar a biometria/PIN deste celular.
   */
  async entrarEmCofreExistente(dek: CryptoKey, meta: MetaCofre, planilhaId: string): Promise<void> {
    const remoto = this.exigirRemoto();
    const email = await remoto.emailDaConta();
    await this.deps.armazem.apagarMeta(CHAVE_MODO);
    const loja = new Loja(new RepositorioCifrado(this.deps.armazem, dek));
    await loja.iniciar();
    const planilha = remoto.abrirPlanilha(planilhaId);
    const sync = new Sincronizador({ loja, remoto: planilha, meta: this.deps.armazem, dek, agora: this.agora });
    await sync.sincronizar();
    const estadoSync = sync.obter();
    if (estadoSync.tipo === 'erro') throw new Error(estadoSync.mensagem);
    const config = loja.obterFoto().estado.config;
    const pessoa = pessoaDoEmail(config, email);
    if (!pessoa) {
      await this.deps.armazem.apagarTudo();
      throw new ContaNaoAutorizada(email);
    }
    await loja.definirEuSou(pessoa);
    await this.deps.cofre.salvarMeta(meta);
    await this.deps.armazem.gravarMeta(CHAVE_PLANILHA, planilhaId);
    loja.executar((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    await loja.aguardarGravacao();
    await this.abrirLoja(loja, dek);
  }

  /** Abre o app com a DEK obtida pela biometria, PIN ou frase. */
  async abrir(dek: CryptoKey): Promise<void> {
    const loja = new Loja(new RepositorioCifrado(this.deps.armazem, dek));
    await loja.iniciar();
    await this.abrirLoja(loja, dek);
  }

  private async abrirLoja(loja: Loja, dek: CryptoKey): Promise<void> {
    this.dek = dek;
    await this.deps.cofre.guardarSessao(dek, this.agora() + BLOQUEIO_AUTOMATICO_MS);
    const sync = await this.ligarSincronizacao(loja, dek);
    this.mudar({ fase: 'aberto', loja, modo: 'real', sync });
  }

  private async ligarSincronizacao(loja: Loja, dek: CryptoKey): Promise<Sincronizador | null> {
    this.pararSync?.();
    this.pararSync = null;
    this.planilha = null;
    const remoto = this.deps.remoto;
    const id = await this.deps.armazem.lerMeta(CHAVE_PLANILHA);
    if (!remoto || !id) return null;
    this.planilha = remoto.abrirPlanilha(id);
    const sync = new Sincronizador({ loja, remoto: this.planilha, meta: this.deps.armazem, dek, agora: this.agora });
    this.pararSync = sync.iniciar(this.deps.janela, this.deps.documento);
    // Carrega o login do Google antes, para o "Toque para sincronizar" abrir a janela na hora.
    remoto.preparar().catch(() => undefined);
    return sync;
  }

  /**
   * "Toque para sincronizar": abre o login do Google (chamar dentro do toque), confere se a conta
   * está autorizada e sincroniza.
   */
  async entrarNoGoogle(): Promise<void> {
    if (this.estado.fase !== 'aberto' || !this.estado.sync) return;
    const remoto = this.exigirRemoto();
    const { loja, sync } = this.estado;
    const { config } = loja.obterFoto().estado;
    const meuEmail = loja.obterFoto().euSou === 'A' ? config.emailA : config.emailB;
    await remoto.entrar(meuEmail || undefined);
    const email = await remoto.emailDaConta();
    if ((config.emailA || config.emailB) && !pessoaDoEmail(config, email)) {
      remoto.sair();
      throw new ContaNaoAutorizada(email);
    }
    await sync.sincronizar();
  }

  /** Guarda uma mensagem para mostrar uma única vez quando o app abrir (depois de criar o cofre). */
  definirAvisoInicial(texto: string): void {
    this.avisoInicial = texto;
  }

  /** Devolve a mensagem guardada (e a esquece). */
  tomarAvisoInicial(): string | null {
    const t = this.avisoInicial;
    this.avisoInicial = null;
    return t;
  }

  /** Nome de quem usa este aparelho (para a passkey). */
  nomeDeQuemUsa(): string {
    if (this.estado.fase !== 'aberto') return 'Viver Gasta';
    const { estado, euSou } = this.estado.loja.obterFoto();
    return nomeDe(estado.config, euSou);
  }

  /** Troca o desbloqueio deste aparelho para PIN (precisa estar desbloqueado). */
  async configurarPin(pin: string): Promise<void> {
    if (!this.dek) throw new Error('Desbloqueie o app primeiro.');
    await this.deps.cofre.configurarPin(this.dek, pin);
  }

  /** Troca o desbloqueio deste aparelho para biometria (precisa estar desbloqueado). */
  async configurarBiometria(nomePessoa: string): Promise<void> {
    if (!this.dek) throw new Error('Desbloqueie o app primeiro.');
    await this.deps.cofre.configurarBiometria(this.dek, nomePessoa);
  }

  /**
   * Troca a frase-mestra: exige a atual. Com planilha, grava primeiro nela (para o outro celular
   * e a recuperação usarem a frase nova) e só depois neste aparelho.
   */
  async trocarFrase(fraseAtual: string, novasPalavras: readonly string[]): Promise<ResultadoFraseDigitada> {
    const r = await this.deps.cofre.abrirComFrase(fraseAtual);
    if (!r.ok) return r;
    const meta = await this.deps.cofre.gerarMeta(r.dek, novasPalavras);
    if (this.planilha) await this.planilha.anexarMetaCofre(meta);
    await this.deps.cofre.salvarMeta(meta);
    return r;
  }

  /** Bloqueia agora (só no modo real; a demonstração não tem segredo). */
  async bloquear(): Promise<void> {
    if (this.estado.fase === 'aberto' && this.estado.modo === 'real') {
      await this.estado.loja.aguardarGravacao();
      await this.deps.cofre.esquecerSessao();
      await this.irParaBloqueado();
    }
  }

  /** Volta à tela de bloqueio (ex.: depois de 10 PINs errados o método some). */
  async irParaBloqueado(): Promise<void> {
    this.desligar();
    this.mudar({ fase: 'bloqueado', metodo: await this.deps.cofre.metodo() });
  }

  /** Apaga TODOS os dados reais deste aparelho (cofre, desbloqueio e despesas). */
  async apagarDadosDoAparelho(): Promise<void> {
    if (this.estado.fase === 'aberto') await this.estado.loja.aguardarGravacao();
    this.desligar();
    this.deps.remoto?.sair();
    await this.deps.armazem.apagarTudo();
    this.mudar({ fase: 'boas-vindas' });
  }

  private desligar(): void {
    this.dek = null;
    this.pararSync?.();
    this.pararSync = null;
    this.planilha = null;
  }

  private exigirRemoto(): ServicoRemoto {
    const r = this.deps.remoto;
    if (!r) throw new Error('O Google não está configurado neste app.');
    return r;
  }

  // --- Bloqueio automático ---

  /** Empurra o prazo de 1 hora (o app está sendo usado). */
  manterSessaoViva(): void {
    if (this.estado.fase === 'aberto' && this.estado.modo === 'real') {
      void this.deps.cofre.renovarSessao(this.agora() + BLOQUEIO_AUTOMATICO_MS);
    }
  }

  /** Chamar quando o app vai para segundo plano. */
  foiParaSegundoPlano(): void {
    this.manterSessaoViva();
    this.escondidoDesde = this.agora();
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      void this.bloquear();
    }, BLOQUEIO_AUTOMATICO_MS);
  }

  /** Chamar quando o app volta para a frente. */
  voltouParaFrente(): void {
    clearTimeout(this.temporizador);
    const desde = this.escondidoDesde;
    this.escondidoDesde = null;
    if (desde !== null && this.agora() - desde >= BLOQUEIO_AUTOMATICO_MS) void this.bloquear();
  }

  /** Liga o bloqueio automático aos eventos do navegador. */
  vigiar(documento: Document): () => void {
    const aoMudar = (): void => {
      if (documento.visibilityState === 'hidden') this.foiParaSegundoPlano();
      else this.voltouParaFrente();
    };
    documento.addEventListener('visibilitychange', aoMudar);
    // Enquanto o app está na tela, o prazo vai sendo renovado.
    const renovacao = setInterval(() => {
      if (documento.visibilityState === 'visible') this.manterSessaoViva();
    }, RENOVACAO_MS);
    return () => {
      documento.removeEventListener('visibilitychange', aoMudar);
      clearInterval(renovacao);
    };
  }

  // --- Integração com o React ---

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  obter = (): EstadoSessao => this.estado;

  private mudar(novo: EstadoSessao): void {
    this.estado = novo;
    for (const o of this.ouvintes) o();
  }
}
