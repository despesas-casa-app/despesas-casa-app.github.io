import { formatarPercentual, lerPercentual } from '../../dominio/percentual.ts';
import type { Pessoa, PontosBase } from '../../dominio/tipos.ts';

/** % de quem usa o aparelho, a partir do % da Pessoa A (e vice-versa: a conta é a mesma). */
export function pctDe(euSou: Pessoa, pctA: PontosBase): PontosBase {
  return euSou === 'A' ? pctA : 10000 - pctA;
}

export function pctParaTexto(p: PontosBase): string {
  return formatarPercentual(p).replace('%', '');
}

/** Lê o campo "sua parte" e devolve o % da Pessoa A (ou null se o texto for inválido). */
export function pctADoTexto(euSou: Pessoa, texto: string): PontosBase | null {
  const meu = lerPercentual(texto);
  return meu === null ? null : pctDe(euSou, meu);
}
