import {
  ErroDeRede,
  ErroSemAcesso,
  ErroSemAutorizacao,
  type LinhaRemota,
  type RepositorioRemoto,
} from '../armazenamento/remoto.ts';
import { cifrarEvento, decifrarEvento } from '../cripto/conteudo.ts';
import type { Evento } from '../dominio/eventos.ts';
import type { Loja } from './loja.ts';

/**
 * Sincronização (especificação 6):
 * - fila de saída (outbox): tudo o que este aparelho criou e a planilha ainda não confirmou;
 * - puxada incremental: lê a aba "eventos" a partir da última linha conhecida;
 * - só dados já criptografados saem do aparelho;
 * - gatilhos: ao abrir, ao voltar a conexão, a cada ~30 s com o app na tela e logo depois de
 *   cada lançamento;
 * - retentativa com espera crescente (backoff), o que também respeita o limite da API.
 */

export type EstadoSincronizacao =
  | { readonly tipo: 'sincronizado'; readonly em: number }
  | { readonly tipo: 'sincronizando'; readonly pendentes: number }
  | { readonly tipo: 'pendente'; readonly pendentes: number }
  | { readonly tipo: 'offline'; readonly pendentes: number }
  | { readonly tipo: 'precisa-toque'; readonly pendentes: number }
  | { readonly tipo: 'erro'; readonly pendentes: number; readonly mensagem: string };

/** Onde a sincronização guarda o que já foi confirmado e até onde já leu. */
export interface MetaSincronizacao {
  lerMeta(chave: string): Promise<string | undefined>;
  gravarMeta(chave: string, valor: string): Promise<void>;
}

export interface DependenciasSincronizacao {
  readonly loja: Loja;
  readonly remoto: RepositorioRemoto;
  readonly meta: MetaSincronizacao;
  readonly dek: CryptoKey;
  readonly online?: () => boolean;
  readonly agora?: () => number;
}

export const INTERVALO_MS = 30_000;
export const ESPERA_APOS_LANCAMENTO_MS = 1_500;
export const ESPERA_MINIMA_MS = 5_000;
export const ESPERA_MAXIMA_MS = 5 * 60_000;
const LOTE_MAXIMO = 200;

const CHAVE_CONFIRMADOS = 'syncConfirmados';
const CHAVE_POSICAO = 'syncPosicao';

export class Sincronizador {
  private estado: EstadoSincronizacao = { tipo: 'pendente', pendentes: 0 };
  private ouvintes = new Set<() => void>();
  private confirmados = new Set<string>();
  private posicao = 0;
  private emAndamento: Promise<void> | null = null;
  private falhasSeguidas = 0;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private intervalo: ReturnType<typeof setInterval> | undefined;
  private carregado = false;
  /** Linhas da planilha que não abriram (outro cofre ou dado corrompido). */
  ilegiveis = 0;

  private readonly online: () => boolean;
  private readonly agora: () => number;

  constructor(private readonly deps: DependenciasSincronizacao) {
    this.online = deps.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    this.agora = deps.agora ?? (() => Date.now());
  }

  /** Eventos deste aparelho que a planilha ainda não confirmou. */
  pendentes(): Evento[] {
    return this.deps.loja.todosEventos.filter((e) => !this.confirmados.has(e.id));
  }

  private async carregar(): Promise<void> {
    if (this.carregado) return;
    try {
      const lista: unknown = JSON.parse((await this.deps.meta.lerMeta(CHAVE_CONFIRMADOS)) ?? '[]');
      if (Array.isArray(lista)) for (const id of lista) if (typeof id === 'string') this.confirmados.add(id);
    } catch {
      // Lista corrompida: no pior caso reenvia eventos (quem lê ignora os repetidos).
    }
    this.posicao = Math.max(0, Number(await this.deps.meta.lerMeta(CHAVE_POSICAO)) || 0);
    this.carregado = true;
  }

  private async salvarProgresso(): Promise<void> {
    await this.deps.meta.gravarMeta(CHAVE_CONFIRMADOS, JSON.stringify([...this.confirmados]));
    await this.deps.meta.gravarMeta(CHAVE_POSICAO, String(this.posicao));
  }

  /** Espera a rodada em andamento terminar (se houver). */
  ocioso(): Promise<void> {
    return this.emAndamento ?? Promise.resolve();
  }

  /** Sincroniza agora (se já estiver sincronizando, espera a rodada atual). */
  sincronizar(): Promise<void> {
    this.emAndamento ??= this.rodada().finally(() => {
      this.emAndamento = null;
    });
    return this.emAndamento;
  }

  private async rodada(): Promise<void> {
    await this.carregar();
    clearTimeout(this.temporizador);
    if (!this.online()) {
      this.mudar({ tipo: 'offline', pendentes: this.pendentes().length });
      return;
    }
    this.mudar({ tipo: 'sincronizando', pendentes: this.pendentes().length });
    try {
      await this.enviar();
      await this.receber();
      await this.salvarProgresso();
      this.falhasSeguidas = 0;
      const restantes = this.pendentes().length;
      if (restantes > 0) {
        // Algo foi lançado durante a rodada: manda logo em seguida.
        this.mudar({ tipo: 'pendente', pendentes: restantes });
        this.agendar(ESPERA_APOS_LANCAMENTO_MS);
      } else {
        this.mudar({ tipo: 'sincronizado', em: this.agora() });
      }
    } catch (erro) {
      await this.salvarProgresso().catch(() => undefined);
      this.tratarErro(erro);
    }
  }

  private async enviar(): Promise<void> {
    const pendentes = this.pendentes();
    for (let i = 0; i < pendentes.length; i += LOTE_MAXIMO) {
      const lote = pendentes.slice(i, i + LOTE_MAXIMO);
      const linhas: LinhaRemota[] = await Promise.all(lote.map((e) => cifrarEvento(this.deps.dek, e)));
      await this.deps.remoto.anexar(linhas);
      for (const e of lote) this.confirmados.add(e.id);
    }
  }

  private async receber(): Promise<void> {
    const leitura = await this.deps.remoto.lerAPartirDe(this.posicao);
    const abertos: Evento[] = [];
    for (const linha of leitura.linhas) {
      try {
        abertos.push(await decifrarEvento(this.deps.dek, linha));
      } catch {
        this.ilegiveis += 1;
      }
    }
    this.deps.loja.receberRemotos(abertos);
    for (const e of abertos) this.confirmados.add(e.id);
    this.posicao = leitura.proximaPosicao;
  }

  private tratarErro(erro: unknown): void {
    const pendentes = this.pendentes().length;
    if (erro instanceof ErroSemAutorizacao) {
      this.mudar({ tipo: 'precisa-toque', pendentes });
      return;
    }
    if (erro instanceof ErroSemAcesso) {
      this.mudar({ tipo: 'erro', pendentes, mensagem: erro.message });
      return;
    }
    this.falhasSeguidas += 1;
    const espera = Math.min(ESPERA_MAXIMA_MS, ESPERA_MINIMA_MS * 2 ** (this.falhasSeguidas - 1));
    if (erro instanceof ErroDeRede || !this.online()) this.mudar({ tipo: 'offline', pendentes });
    else this.mudar({ tipo: 'erro', pendentes, mensagem: erro instanceof Error ? erro.message : 'Erro ao sincronizar.' });
    this.agendar(espera);
  }

  private agendar(ms: number): void {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      void this.sincronizar();
    }, ms);
  }

  /**
   * Liga os gatilhos automáticos. "janela" e "documento" vêm de fora para poderem ser testados.
   * Devolve a função que desliga tudo.
   */
  iniciar(
    janela?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
    documento?: Pick<Document, 'visibilityState'>,
  ): () => void {
    const pararEventos = this.deps.loja.assinarEventosLocais(() => {
      if (this.estado.tipo === 'sincronizado' || this.estado.tipo === 'pendente') {
        this.mudar({ tipo: 'pendente', pendentes: this.pendentes().length });
      }
      if (this.estado.tipo !== 'precisa-toque') this.agendar(ESPERA_APOS_LANCAMENTO_MS);
    });
    const aoVoltarConexao = (): void => {
      void this.sincronizar();
    };
    janela?.addEventListener('online', aoVoltarConexao);
    this.intervalo = setInterval(() => {
      const visivel = !documento || documento.visibilityState === 'visible';
      if (visivel && this.estado.tipo !== 'precisa-toque' && this.emAndamento === null) void this.sincronizar();
    }, INTERVALO_MS);
    void this.sincronizar();
    return () => {
      pararEventos();
      janela?.removeEventListener('online', aoVoltarConexao);
      clearInterval(this.intervalo);
      clearTimeout(this.temporizador);
    };
  }

  // --- Integração com o React ---

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  obter = (): EstadoSincronizacao => this.estado;

  private mudar(novo: EstadoSincronizacao): void {
    this.estado = novo;
    for (const o of this.ouvintes) o();
  }
}
