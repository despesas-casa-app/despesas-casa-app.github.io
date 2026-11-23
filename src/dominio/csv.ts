/**
 * Leitor de CSV (padrão RFC 4180: vírgula como separador, aspas para células com vírgula, aspas
 * ou quebra de linha). Usado na recuperação (CSVs do Google Planilhas) e na importação do Tricount.
 * Linhas totalmente vazias são descartadas.
 */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let entreAspas = false;
  const t = texto.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t.charAt(i);
    if (entreAspas) {
      if (c === '"' && t[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') entreAspas = false;
      else celula += c;
    } else if (c === '"') entreAspas = true;
    else if (c === ',') {
      linha.push(celula);
      celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = '';
    } else celula += c;
  }
  if (celula !== '' || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((x) => x !== ''));
}
