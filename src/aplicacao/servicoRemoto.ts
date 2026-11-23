import type { RepositorioRemoto } from '../armazenamento/remoto.ts';
import type { MetaCofre } from './cofre.ts';

/** A planilha do casal vista pela aplicação: o log de eventos + os parâmetros do cofre. */
export interface PlanilhaDoCasal extends RepositorioRemoto {
  readonly id: string;
  readonly endereco: string;
  lerMetaCofre(): Promise<MetaCofre | null>;
  anexarMetaCofre(meta: MetaCofre): Promise<void>;
}

/**
 * O que a aplicação precisa do Google, sem depender dele diretamente (assim os testes usam uma
 * versão em memória). A implementação real fica em src/google/servico.ts.
 */
export interface ServicoRemoto {
  /** Carrega o que for preciso antes, para que o toque da pessoa abra a janela do Google na hora. */
  preparar(): Promise<void>;
  /** Abre a janela de login (chamar dentro de um toque). "dica" = e-mail esperado. */
  entrar(dica?: string): Promise<void>;
  readonly conectado: boolean;
  emailDaConta(): Promise<string>;
  criarPlanilha(): Promise<PlanilhaDoCasal>;
  abrirPlanilha(id: string): PlanilhaDoCasal;
  compartilhar(planilhaId: string, email: string): Promise<void>;
  /** Seletor de arquivos do Google. null = a pessoa cancelou. */
  escolherPlanilha(): Promise<{ readonly id: string; readonly nome: string } | null>;
  sair(): void;
}
