import type { PlanilhaDoCasal, ServicoRemoto } from '../aplicacao/servicoRemoto.ts';
import { AutenticacaoGoogle } from './auth.ts';
import type { ConfigGoogle } from './config.ts';
import { compartilharPlanilha, emailDaConta } from './drive.ts';
import { escolherPlanilha } from './picker.ts';
import { PlanilhaGoogle } from './planilha.ts';

/** Implementação real do ServicoRemoto com as APIs do Google. */
export class ServicoGoogle implements ServicoRemoto {
  private readonly auth: AutenticacaoGoogle;

  constructor(private readonly config: ConfigGoogle) {
    this.auth = new AutenticacaoGoogle(config);
  }

  preparar(): Promise<void> {
    return this.auth.preparar();
  }

  async entrar(dica?: string): Promise<void> {
    await this.auth.entrar(dica);
  }

  get conectado(): boolean {
    return this.auth.conectado;
  }

  emailDaConta(): Promise<string> {
    return emailDaConta(this.auth.obterToken);
  }

  criarPlanilha(): Promise<PlanilhaDoCasal> {
    return PlanilhaGoogle.criar(this.auth.obterToken);
  }

  abrirPlanilha(id: string): PlanilhaDoCasal {
    return new PlanilhaGoogle(id, this.auth.obterToken);
  }

  compartilhar(planilhaId: string, email: string): Promise<void> {
    return compartilharPlanilha(planilhaId, email, this.auth.obterToken);
  }

  escolherPlanilha(): Promise<{ readonly id: string; readonly nome: string } | null> {
    return escolherPlanilha(this.config, this.auth.obterToken());
  }

  sair(): void {
    this.auth.sair();
  }
}
