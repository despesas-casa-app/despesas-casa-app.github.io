import type { Contexto, Resultado } from '../dominio/contexto.ts';
import { dataLocal } from '../dominio/competencia.ts';
import type { Evento } from '../dominio/eventos.ts';
import { lerEstado, type Estado } from '../dominio/estado.ts';
import { avancar, formatarHlc, lerHlc, receber, type Hlc } from '../dominio/hlc.ts';
import { ordenarSemRepetir, projetar } from '../dominio/projecao.ts';
import { gerarRecorrentesPendentes } from '../dominio/recorrentes.ts';
import { ehPessoa, type Pessoa } from '../dominio/tipos.ts';
import type { RepositorioLocal } from '../armazenamento/local.ts';

/** Uma "foto" do app para a interface. Muda de identidade a cada alteração. */
export interface Foto {
  readonly estado: Estado;
  /** Quem usa este aparelho. */
  readonly euSou: Pessoa;
  readonly carregado: boolean;
  readonly erroAoSalvar: string | null;
}

export type Regra = (estado: Estado, ctx: Contexto) => Resultado | readonly Evento[];

function idAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/**
 * Guarda os eventos do aparelho, monta o estado e executa as regras de negócio.
 * A interface só conversa com a Loja; a Loja só conversa com o domínio e o armazenamento.
 */
export class Loja {
  private eventos: Evento[] = [];
  private hlc: Hlc | null = null;
  private aparelho = 'carregando';
  private ouvintes = new Set<() => void>();
  private ouvintesLocais = new Set<() => void>();
  private foto: Foto;
  private salvando: Promise<void> = Promise.resolve();

  constructor(
    private readonly repo: RepositorioLocal,
    private readonly agora: () => Date = () => new Date(),
  ) {
    this.foto = { estado: lerEstado(projetar([])), euSou: 'A', carregado: false, erroAoSalvar: null };
  }

  /** Carrega o banco local. Se estiver vazio, usa "semear" (dados de demonstração). */
  async iniciar(semear?: (loja: Loja) => void): Promise<void> {
    this.aparelho = (await this.repo.lerMeta('aparelho')) ?? `ap${idAleatorio()}`;
    await this.repo.gravarMeta('aparelho', this.aparelho);
    const euSou = await this.repo.lerMeta('euSou');
    this.eventos = ordenarSemRepetir(await this.repo.carregarEventos());
    this.acertarRelogio(this.eventos);
    this.foto = {
      ...this.foto,
      estado: lerEstado(projetar(this.eventos)),
      euSou: ehPessoa(euSou) ? euSou : 'A',
      carregado: true,
    };
    if (this.eventos.length === 0 && semear) semear(this);
    this.executar((estado, ctx) => gerarRecorrentesPendentes(estado, ctx));
    this.publicar();
  }

  /** Garante que o relógio deste aparelho fique depois de todos os eventos já vistos. */
  private acertarRelogio(eventos: readonly Evento[]): void {
    let maior: string | null = null;
    for (const e of eventos) if (maior === null || e.hlc > maior) maior = e.hlc;
    if (maior) this.hlc = receber(this.hlc, lerHlc(maior), this.agora().getTime(), this.aparelho);
  }

  /** Contexto para as regras. "instante" permite gerar dados de demonstração no passado. */
  contexto(instante?: Date): Contexto {
    const momento = instante ?? this.agora();
    return {
      autor: this.foto.euSou,
      hoje: dataLocal(momento),
      carimbar: () => {
        this.hlc = avancar(this.hlc, momento.getTime(), this.aparelho);
        return formatarHlc(this.hlc);
      },
      novoId: () => crypto.randomUUID(),
    };
  }

  /**
   * Executa uma regra. Se der certo, aplica na hora (a interface responde imediatamente) e
   * grava no banco local em segundo plano.
   */
  executar(regra: Regra, ctx: Contexto = this.contexto()): Resultado {
    const r = regra(this.foto.estado, ctx);
    const resultado: Resultado = 'ok' in r ? r : { ok: true, eventos: r };
    if (resultado.ok && resultado.eventos.length > 0) {
      this.incorporar(resultado.eventos);
      for (const o of this.ouvintesLocais) o();
    }
    return resultado;
  }

  /**
   * Recebe eventos vindos do outro celular (sincronização). Ignora os que já conhece e acerta o
   * relógio para ficar depois deles. Devolve quantos eram novos.
   */
  receberRemotos(eventos: readonly Evento[]): number {
    const conhecidos = new Set(this.eventos.map((e) => e.id));
    const novos = eventos.filter((e) => !conhecidos.has(e.id));
    if (novos.length === 0) return 0;
    this.acertarRelogio(novos);
    this.incorporar(novos);
    return novos.length;
  }

  /** Avisa quando ESTE aparelho cria eventos (para a sincronização enviar logo). */
  assinarEventosLocais(ouvinte: () => void): () => void {
    this.ouvintesLocais.add(ouvinte);
    return () => this.ouvintesLocais.delete(ouvinte);
  }

  /** Recebe eventos (da própria regra ou, na Fase 3, da sincronização). */
  incorporar(novos: readonly Evento[]): void {
    this.eventos = ordenarSemRepetir([...this.eventos, ...novos]);
    this.foto = { ...this.foto, estado: lerEstado(projetar(this.eventos)) };
    this.salvando = this.salvando
      .then(() => this.repo.salvarEventos(novos))
      .then(() => {
        if (this.foto.erroAoSalvar) this.atualizar({ erroAoSalvar: null });
      })
      .catch((erro: unknown) => {
        this.atualizar({ erroAoSalvar: erro instanceof Error ? erro.message : 'Erro ao salvar' });
      });
    this.publicar();
  }

  async definirEuSou(p: Pessoa): Promise<void> {
    await this.repo.gravarMeta('euSou', p);
    this.atualizar({ euSou: p });
  }

  /** Apaga tudo deste aparelho e recomeça (no modo demonstração, com dados novos). */
  async apagarTudo(semear?: (loja: Loja) => void): Promise<void> {
    await this.salvando;
    await this.repo.apagarTudo();
    this.eventos = [];
    this.hlc = null;
    this.foto = { estado: lerEstado(projetar([])), euSou: 'A', carregado: false, erroAoSalvar: null };
    await this.iniciar(semear);
  }

  /** Espera as gravações pendentes (usado em testes). */
  aguardarGravacao(): Promise<void> {
    return this.salvando;
  }

  get todosEventos(): readonly Evento[] {
    return this.eventos;
  }

  // --- Integração com o React (useSyncExternalStore) ---

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  obterFoto = (): Foto => this.foto;

  private atualizar(parcial: Partial<Foto>): void {
    this.foto = { ...this.foto, ...parcial };
    this.publicar();
  }

  private publicar(): void {
    for (const o of this.ouvintes) o();
  }
}
