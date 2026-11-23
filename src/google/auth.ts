import { ErroSemAutorizacao } from '../armazenamento/remoto.ts';
import { ESCOPO_DRIVE_FILE, URL_SCRIPT_LOGIN, type ConfigGoogle } from './config.ts';
import { carregarScript } from './scripts.ts';

/** Margem para renovar antes de vencer (o token do Google dura cerca de 1 hora). */
const MARGEM_MS = 60_000;

type GoogleGlobal = NonNullable<Window['google']>;

/**
 * Login com o Google Identity Services, no modelo de token (especificação 5.5).
 * - O token fica SÓ em memória (nunca em localStorage ou no banco).
 * - Abrir a janela do Google precisa de um toque da pessoa (o navegador bloqueia janelas que
 *   abrem sozinhas). Por isso, quando o token vence, o app mostra "Toque para sincronizar".
 */
export class AutenticacaoGoogle {
  private token: { readonly valor: string; readonly expiraEm: number } | null = null;
  private cliente: ClienteTokenGoogle | null = null;
  private pedido: { ok: (t: string) => void; erro: (e: Error) => void } | null = null;
  private dica: string | undefined;

  constructor(
    private readonly config: ConfigGoogle,
    private readonly carregar: (url: string) => Promise<void> = carregarScript,
    private readonly google: () => GoogleGlobal | undefined = () => window.google,
    private readonly agora: () => number = () => Date.now(),
  ) {}

  /** Carrega a biblioteca antes, para que o toque abra a janela do Google na hora. */
  async preparar(): Promise<void> {
    if (this.cliente) return;
    await this.carregar(URL_SCRIPT_LOGIN);
    const oauth2 = this.google()?.accounts?.oauth2;
    if (!oauth2) throw new Error('Não foi possível carregar o login do Google.');
    this.cliente = oauth2.initTokenClient({
      client_id: this.config.clientId,
      scope: ESCOPO_DRIVE_FILE,
      callback: (r) => { this.aoResponder(r); },
      error_callback: (e) => {
        this.aoFalhar(e.type === 'popup_closed' ? 'A janela do Google foi fechada.' : (e.message ?? 'O login não foi concluído.'));
      },
    });
  }

  private aoResponder(r: RespostaTokenGoogle): void {
    if (r.error || !r.access_token) {
      this.aoFalhar(r.error_description ?? 'O Google não autorizou o acesso.');
      return;
    }
    const segundos = Number(r.expires_in) || 3600;
    this.token = { valor: r.access_token, expiraEm: this.agora() + segundos * 1000 };
    this.pedido?.ok(r.access_token);
    this.pedido = null;
  }

  private aoFalhar(mensagem: string): void {
    this.pedido?.erro(new ErroSemAutorizacao(mensagem));
    this.pedido = null;
  }

  /**
   * Abre a janela do Google e devolve o token. Chamar dentro do toque da pessoa.
   * "dica" é o e-mail esperado (pula a escolha de conta quando possível).
   */
  async entrar(dica?: string): Promise<string> {
    if (dica) this.dica = dica;
    if (!this.cliente) await this.preparar();
    const cliente = this.cliente;
    if (!cliente) throw new Error('Login do Google indisponível.');
    return new Promise<string>((ok, erro) => {
      this.pedido?.erro(new ErroSemAutorizacao('Outro pedido de login foi aberto.'));
      this.pedido = { ok, erro };
      cliente.requestAccessToken({ prompt: '', ...(this.dica ? { login_hint: this.dica } : {}) });
    });
  }

  /** Token atual. Lança ErroSemAutorizacao se não há login ou se ele está para vencer. */
  obterToken = (): string => {
    if (this.token && this.token.expiraEm - MARGEM_MS > this.agora()) return this.token.valor;
    throw new ErroSemAutorizacao();
  };

  get conectado(): boolean {
    return this.token !== null && this.token.expiraEm - MARGEM_MS > this.agora();
  }

  /** Esquece o token (e pede ao Google para invalidá-lo). */
  sair(): void {
    if (this.token) this.google()?.accounts?.oauth2?.revoke(this.token.valor);
    this.token = null;
  }
}
