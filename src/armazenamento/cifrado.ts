import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Embrulho } from '../cripto/chaves.ts';
import { cifrarEvento, decifrarEvento, type LinhaCifrada } from '../cripto/conteudo.ts';
import type { Evento } from '../dominio/eventos.ts';
import type { RepositorioLocal } from './local.ts';

/**
 * Banco local do modo real (especificação 5.4): guarda APENAS dados criptografados.
 * - "linhas": os eventos, cada um cifrado com a DEK (mesmo formato que vai para a planilha);
 * - "meta": parâmetros sem segredo em claro (DEK sempre embrulhada, salts, contadores);
 * - "sessao": a sessão aberta recentemente (ver SessaoGuardada).
 */

/**
 * Sessão aberta recentemente: a DEK embrulhada por uma chave temporária NÃO exportável (o próprio
 * navegador não deixa nenhum código copiá-la). Permite reabrir o app sem a digital até "expiraEm".
 */
export interface SessaoGuardada {
  readonly chave: CryptoKey;
  readonly dek: Embrulho;
}

export interface ArmazemLocal {
  carregarLinhas(): Promise<LinhaCifrada[]>;
  salvarLinhas(linhas: readonly LinhaCifrada[]): Promise<void>;
  lerMeta(chave: string): Promise<string | undefined>;
  gravarMeta(chave: string, valor: string): Promise<void>;
  apagarMeta(chave: string): Promise<void>;
  apagarTudo(): Promise<void>;
  lerSessao(): Promise<SessaoGuardada | undefined>;
  gravarSessao(sessao: SessaoGuardada): Promise<void>;
  apagarSessao(): Promise<void>;
}

function ehLinha(x: unknown): x is LinhaCifrada {
  if (typeof x !== 'object' || x === null) return false;
  const l = x as Record<string, unknown>;
  return typeof l['id'] === 'string' && typeof l['versao'] === 'number' && typeof l['conteudo'] === 'string';
}

interface Esquema extends DBSchema {
  linhas: { key: string; value: LinhaCifrada };
  meta: { key: string; value: string };
  sessao: { key: string; value: SessaoGuardada };
}

const CHAVE_SESSAO = 'atual';

export class ArmazemIndexedDb implements ArmazemLocal {
  private conexao: Promise<IDBPDatabase<Esquema>> | null = null;

  constructor(private readonly nomeBanco: string) {}

  private banco(): Promise<IDBPDatabase<Esquema>> {
    this.conexao ??= openDB<Esquema>(this.nomeBanco, 2, {
      upgrade(db, versaoAntiga) {
        if (versaoAntiga < 1) {
          db.createObjectStore('linhas', { keyPath: 'id' });
          db.createObjectStore('meta');
        }
        if (versaoAntiga < 2) db.createObjectStore('sessao');
      },
    });
    return this.conexao;
  }

  async carregarLinhas(): Promise<LinhaCifrada[]> {
    return (await (await this.banco()).getAll('linhas')).filter(ehLinha);
  }

  async salvarLinhas(linhas: readonly LinhaCifrada[]): Promise<void> {
    if (linhas.length === 0) return;
    const tx = (await this.banco()).transaction('linhas', 'readwrite');
    await Promise.all([...linhas.map((l) => tx.store.put(l)), tx.done]);
  }

  async lerMeta(chave: string): Promise<string | undefined> {
    return (await this.banco()).get('meta', chave);
  }

  async gravarMeta(chave: string, valor: string): Promise<void> {
    await (await this.banco()).put('meta', valor, chave);
  }

  async apagarMeta(chave: string): Promise<void> {
    await (await this.banco()).delete('meta', chave);
  }

  async apagarTudo(): Promise<void> {
    const db = await this.banco();
    const tx = db.transaction(['linhas', 'meta', 'sessao'], 'readwrite');
    await Promise.all([tx.objectStore('linhas').clear(), tx.objectStore('meta').clear(), tx.objectStore('sessao').clear(), tx.done]);
  }

  async lerSessao(): Promise<SessaoGuardada | undefined> {
    return (await this.banco()).get('sessao', CHAVE_SESSAO);
  }

  async gravarSessao(sessao: SessaoGuardada): Promise<void> {
    await (await this.banco()).put('sessao', sessao, CHAVE_SESSAO);
  }

  async apagarSessao(): Promise<void> {
    await (await this.banco()).delete('sessao', CHAVE_SESSAO);
  }
}

/** Versão em memória, para testes. */
export class ArmazemEmMemoria implements ArmazemLocal {
  readonly linhas = new Map<string, LinhaCifrada>();
  readonly meta = new Map<string, string>();
  sessao: SessaoGuardada | undefined;

  carregarLinhas(): Promise<LinhaCifrada[]> {
    return Promise.resolve([...this.linhas.values()]);
  }

  salvarLinhas(linhas: readonly LinhaCifrada[]): Promise<void> {
    for (const l of linhas) this.linhas.set(l.id, l);
    return Promise.resolve();
  }

  lerMeta(chave: string): Promise<string | undefined> {
    return Promise.resolve(this.meta.get(chave));
  }

  gravarMeta(chave: string, valor: string): Promise<void> {
    this.meta.set(chave, valor);
    return Promise.resolve();
  }

  apagarMeta(chave: string): Promise<void> {
    this.meta.delete(chave);
    return Promise.resolve();
  }

  apagarTudo(): Promise<void> {
    this.linhas.clear();
    this.meta.clear();
    this.sessao = undefined;
    return Promise.resolve();
  }

  lerSessao(): Promise<SessaoGuardada | undefined> {
    return Promise.resolve(this.sessao);
  }

  gravarSessao(sessao: SessaoGuardada): Promise<void> {
    this.sessao = sessao;
    return Promise.resolve();
  }

  apagarSessao(): Promise<void> {
    this.sessao = undefined;
    return Promise.resolve();
  }
}

/**
 * Repositório que a Loja usa no modo real: cifra cada evento ao gravar e decifra ao ler.
 * A DEK só existe em memória enquanto o app está desbloqueado.
 */
export class RepositorioCifrado implements RepositorioLocal {
  /** Linhas que não abriram (corrompidas). Ficam de fora, sem quebrar o app. */
  ilegiveis = 0;

  constructor(
    private readonly armazem: ArmazemLocal,
    private readonly dek: CryptoKey,
  ) {}

  async carregarEventos(): Promise<Evento[]> {
    const linhas = await this.armazem.carregarLinhas();
    const resultados = await Promise.allSettled(linhas.map((l) => decifrarEvento(this.dek, l)));
    const eventos: Evento[] = [];
    this.ilegiveis = 0;
    for (const r of resultados) {
      if (r.status === 'fulfilled') eventos.push(r.value);
      else this.ilegiveis += 1;
    }
    return eventos;
  }

  async salvarEventos(eventos: readonly Evento[]): Promise<void> {
    await this.armazem.salvarLinhas(await Promise.all(eventos.map((e) => cifrarEvento(this.dek, e))));
  }

  lerMeta(chave: string): Promise<string | undefined> {
    return this.armazem.lerMeta(chave);
  }

  gravarMeta(chave: string, valor: string): Promise<void> {
    return this.armazem.gravarMeta(chave, valor);
  }

  apagarTudo(): Promise<void> {
    return this.armazem.apagarTudo();
  }
}
