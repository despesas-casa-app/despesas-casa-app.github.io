import { RepositorioCifrado, type ArmazemLocal } from '../armazenamento/cifrado.ts';
import type { RepositorioLocal } from '../armazenamento/local.ts';
import { criarCategoriasIniciais } from '../dominio/categorias.ts';
import { definirNomes } from '../dominio/config.ts';
import type { Pessoa, PontosBase } from '../dominio/tipos.ts';
import type { Cofre, MetodoDesbloqueio } from './cofre.ts';
import { semearDemonstracao } from './demo.ts';
import { Loja } from './loja.ts';

/** Bloqueio automático depois de 5 minutos em segundo plano (especificação 5.4). */
export const BLOQUEIO_AUTOMATICO_MS = 5 * 60 * 1000;

export type EstadoSessao =
  | { readonly fase: 'iniciando' }
  | { readonly fase: 'boas-vindas' }
  | { readonly fase: 'bloqueado'; readonly metodo: MetodoDesbloqueio | null }
  | { readonly fase: 'aberto'; readonly loja: Loja; readonly modo: 'real' | 'demo' };

export interface DadosIniciais {
  readonly nomeA: string;
  readonly nomeB: string;
  readonly euSou: Pessoa;
  /** % da Pessoa A nas categorias proporcionais. */
  readonly pctProporcional: PontosBase;
}

export interface DependenciasSessao {
  /** Banco do modo real (só dados criptografados). */
  readonly armazem: ArmazemLocal;
  readonly cofre: Cofre;
  /** Banco do modo demonstração (dados fictícios, sem criptografia). */
  readonly repositorioDemo: RepositorioLocal;
  readonly agora?: () => number;
}

const CHAVE_MODO = 'modo';

/**
 * Controla em que "fase" o app está: boas-vindas, bloqueado ou aberto (real ou demonstração).
 * A DEK só existe dentro da Loja aberta; bloquear descarta a Loja, e com ela a chave.
 */
export class Sessao {
  private estado: EstadoSessao = { fase: 'iniciando' };
  private ouvintes = new Set<() => void>();
  private escondidoDesde: number | null = null;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private readonly agora: () => number;

  constructor(private readonly deps: DependenciasSessao) {
    this.agora = deps.agora ?? (() => Date.now());
  }

  get cofre(): Cofre {
    return this.deps.cofre;
  }

  async iniciar(): Promise<void> {
    if (await this.deps.cofre.existe()) {
      await this.irParaBloqueado();
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
    this.mudar({ fase: 'aberto', loja, modo: 'demo' });
  }

  /** Sai da demonstração (os dados fictícios ficam guardados à parte). */
  async sairDemo(): Promise<void> {
    await this.deps.armazem.apagarMeta(CHAVE_MODO);
    this.mudar({ fase: 'boas-vindas' });
  }

  /** Depois de criar o cofre e o desbloqueio: grava nomes e categorias e abre o app. */
  async concluirCriacao(dek: CryptoKey, dados: DadosIniciais): Promise<void> {
    await this.deps.armazem.apagarMeta(CHAVE_MODO);
    const loja = new Loja(new RepositorioCifrado(this.deps.armazem, dek));
    await loja.iniciar();
    await loja.definirEuSou(dados.euSou);
    const nomes = loja.executar((e, ctx) => definirNomes(e, dados.nomeA, dados.nomeB, ctx));
    if (!nomes.ok) throw new Error(nomes.erro === 'invalido' ? nomes.mensagem : 'Não foi possível salvar os nomes.');
    loja.executar((_, ctx) => criarCategoriasIniciais(dados.pctProporcional, ctx));
    await loja.aguardarGravacao();
    this.mudar({ fase: 'aberto', loja, modo: 'real' });
  }

  /** Abre o app com a DEK obtida pela biometria, PIN ou frase. */
  async abrir(dek: CryptoKey): Promise<void> {
    const loja = new Loja(new RepositorioCifrado(this.deps.armazem, dek));
    await loja.iniciar();
    this.mudar({ fase: 'aberto', loja, modo: 'real' });
  }

  /** Bloqueia agora (só no modo real; a demonstração não tem segredo). */
  async bloquear(): Promise<void> {
    if (this.estado.fase === 'aberto' && this.estado.modo === 'real') {
      await this.estado.loja.aguardarGravacao();
      await this.irParaBloqueado();
    }
  }

  /** Volta à tela de bloqueio (ex.: depois de 10 PINs errados o método some). */
  async irParaBloqueado(): Promise<void> {
    this.mudar({ fase: 'bloqueado', metodo: await this.deps.cofre.metodo() });
  }

  /** Apaga TODOS os dados reais deste aparelho (cofre, desbloqueio e despesas). */
  async apagarDadosDoAparelho(): Promise<void> {
    if (this.estado.fase === 'aberto') await this.estado.loja.aguardarGravacao();
    await this.deps.armazem.apagarTudo();
    this.mudar({ fase: 'boas-vindas' });
  }

  // --- Bloqueio automático ---

  /** Chamar quando o app vai para segundo plano. */
  foiParaSegundoPlano(): void {
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
    return () => {
      documento.removeEventListener('visibilitychange', aoMudar);
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
