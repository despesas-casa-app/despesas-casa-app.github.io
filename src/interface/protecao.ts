/**
 * Proteção contra "clickjacking": outro site carregar este app escondido dentro de si (num
 * iframe) para enganar o usuário. O jeito certo seria o cabeçalho "frame-ancestors" da CSP,
 * mas o GitHub Pages não permite cabeçalhos — então o próprio app se recusa a rodar embutido.
 */
export interface JanelaComparavel {
  readonly top: unknown;
  readonly self: unknown;
}

export function estaEmbutido(janela: JanelaComparavel): boolean {
  try {
    return janela.top !== janela.self;
  } catch {
    // Se nem dá para comparar, é porque está dentro de outro site.
    return true;
  }
}
