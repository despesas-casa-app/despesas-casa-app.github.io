import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ehEvento, type Evento } from '../dominio/eventos.ts';

/**
 * Armazenamento LOCAL: o banco do próprio aparelho (IndexedDB). A interface lê sempre daqui,
 * por isso o app abre instantâneo e funciona offline.
 *
 * Fase 1 (modo demonstração): eventos guardados como estão (dados fictícios).
 * Fase 2: o conteúdo passa a ser guardado criptografado.
 */
export interface RepositorioLocal {
  carregarEventos(): Promise<Evento[]>;
  salvarEventos(eventos: readonly Evento[]): Promise<void>;
  lerMeta(chave: string): Promise<string | undefined>;
  gravarMeta(chave: string, valor: string): Promise<void>;
  apagarTudo(): Promise<void>;
}

interface Esquema extends DBSchema {
  eventos: { key: string; value: Evento };
  meta: { key: string; value: string };
}

export class LocalIndexedDb implements RepositorioLocal {
  private conexao: Promise<IDBPDatabase<Esquema>> | null = null;

  constructor(private readonly nomeBanco: string) {}

  private banco(): Promise<IDBPDatabase<Esquema>> {
    this.conexao ??= openDB<Esquema>(this.nomeBanco, 1, {
      upgrade(db) {
        db.createObjectStore('eventos', { keyPath: 'id' });
        db.createObjectStore('meta');
      },
    });
    return this.conexao;
  }

  async carregarEventos(): Promise<Evento[]> {
    const todos = await (await this.banco()).getAll('eventos');
    // Dados corrompidos ou de formato desconhecido são ignorados, nunca quebram o app.
    return todos.filter(ehEvento);
  }

  async salvarEventos(eventos: readonly Evento[]): Promise<void> {
    if (eventos.length === 0) return;
    const tx = (await this.banco()).transaction('eventos', 'readwrite');
    await Promise.all([...eventos.map((e) => tx.store.put(e)), tx.done]);
  }

  async lerMeta(chave: string): Promise<string | undefined> {
    return (await this.banco()).get('meta', chave);
  }

  async gravarMeta(chave: string, valor: string): Promise<void> {
    await (await this.banco()).put('meta', valor, chave);
  }

  async apagarTudo(): Promise<void> {
    const db = await this.banco();
    const tx = db.transaction(['eventos', 'meta'], 'readwrite');
    await Promise.all([tx.objectStore('eventos').clear(), tx.objectStore('meta').clear(), tx.done]);
  }
}

/** Versão em memória, para testes. */
export class LocalEmMemoria implements RepositorioLocal {
  private readonly eventos = new Map<string, Evento>();
  private readonly meta = new Map<string, string>();

  carregarEventos(): Promise<Evento[]> {
    return Promise.resolve([...this.eventos.values()]);
  }

  salvarEventos(eventos: readonly Evento[]): Promise<void> {
    for (const e of eventos) this.eventos.set(e.id, e);
    return Promise.resolve();
  }

  lerMeta(chave: string): Promise<string | undefined> {
    return Promise.resolve(this.meta.get(chave));
  }

  gravarMeta(chave: string, valor: string): Promise<void> {
    this.meta.set(chave, valor);
    return Promise.resolve();
  }

  apagarTudo(): Promise<void> {
    this.eventos.clear();
    this.meta.clear();
    return Promise.resolve();
  }
}
