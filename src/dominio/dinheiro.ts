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
