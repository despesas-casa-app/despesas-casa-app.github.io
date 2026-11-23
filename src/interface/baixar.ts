/**
 * Entrega um arquivo gerado no próprio aparelho (nada passa pela internet). No Android ele vai
 * para a pasta Downloads; no PC, para a pasta de downloads do navegador.
 */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 10_000);
}
