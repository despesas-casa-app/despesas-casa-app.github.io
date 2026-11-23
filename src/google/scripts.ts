const carregados = new Map<string, Promise<void>>();

/**
 * Carrega um script do Google (só dos endereços liberados na CSP), uma única vez.
 * Só é chamado quando o Google é realmente necessário: a demonstração nunca fala com o Google.
 */
export function carregarScript(url: string): Promise<void> {
  let p = carregados.get(url);
  if (!p) {
    p = new Promise<void>((ok, erro) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => { ok(); };
      s.onerror = () => {
        carregados.delete(url);
        erro(new Error('Não foi possível carregar o Google. Confira a internet.'));
      };
      document.head.appendChild(s);
    });
    carregados.set(url, p);
  }
  return p;
}
