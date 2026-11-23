/**
 * Dinheiro é sempre um número inteiro de centavos. Nunca usar ponto flutuante para valores.
 * (Especificação, seção 4.4.)
 */
export type Centavos = number;

/** Confere se o valor é um inteiro de centavos seguro (sem casas decimais, sem estourar). */
export function ehCentavosValidos(valor: number): valor is Centavos {
  return Number.isSafeInteger(valor);
}

function exigirCentavos(valor: number): asserts valor is Centavos {
  if (!ehCentavosValidos(valor)) {
    throw new RangeError(`Valor em centavos inválido: ${String(valor)}`);
  }
}

/** Espaço que não quebra linha, para "R$" nunca ficar sozinho no fim de uma linha. */
const ESPACO_FIXO = ' ';

/**
 * Formata centavos no padrão brasileiro: 123456 → "R$ 1.234,56".
 * Feito só com aritmética de inteiros, para dar o mesmo resultado em qualquer aparelho.
 */
export function formatarReais(centavos: Centavos): string {
  exigirCentavos(centavos);
  const negativo = centavos < 0;
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100);
  const resto = absoluto % 100;
  const reaisComPontos = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const texto = `R$${ESPACO_FIXO}${reaisComPontos},${String(resto).padStart(2, '0')}`;
  return negativo ? `-${texto}` : texto;
}

/**
 * Lê um valor digitado no padrão brasileiro: "1.234,56", "1234,5", "R$ 12", "-3,00".
 * Ponto é separador de milhar; vírgula separa os centavos. Inválido → null.
 */
export function lerReais(texto: string): Centavos | null {
  // "\s" já inclui o espaço fixo (NBSP) que o formatarReais usa.
  const limpo = texto.replace(/R\$/i, '').replace(/\s/g, '');
  const m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  if (!m) return null;
  const reais = Number((m[2] ?? '').replaceAll('.', ''));
  const centavos = Number((m[3] ?? '').padEnd(2, '0'));
  const valor = reais * 100 + centavos;
  if (!ehCentavosValidos(valor)) return null;
  return m[1] === '-' ? -valor : valor;
}

/** Soma uma lista de centavos. */
export function somar(valores: readonly Centavos[]): Centavos {
  let total = 0;
  for (const v of valores) total += v;
  exigirCentavos(total);
  return total;
}
