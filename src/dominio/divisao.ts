import { ehCentavosValidos, type Centavos } from './dinheiro.ts';
import { CEM_POR_CENTO, ehPercentualValido } from './percentual.ts';
import type { Pessoa, PontosBase } from './tipos.ts';

export interface Cotas {
  readonly A: Centavos;
  readonly B: Centavos;
}

/** Limite de valor para a conta valor × percentual continuar exata (R$ 9 bilhões). */
export const VALOR_MAXIMO: Centavos = 900_000_000_000;

/**
 * Divide uma despesa entre A e B.
 *
 * Regra do centavo (especificação 4.4): quem pagou absorve o centavo que sobrar. A cota de quem
 * NÃO pagou é arredondada para baixo; a de quem pagou é o resto.
 * Ex.: R$ 10,01 em 50/50 pago por A → A = 5,01 e B = 5,00.
 *
 * Só aritmética de inteiros, sem ponto flutuante.
 */
export function dividir(valor: Centavos, pctA: PontosBase, pagador: Pessoa): Cotas {
  if (!ehCentavosValidos(valor) || Math.abs(valor) > VALOR_MAXIMO) {
    throw new RangeError(`Valor inválido para divisão: ${String(valor)}`);
  }
  if (!ehPercentualValido(pctA)) throw new RangeError(`Percentual inválido: ${String(pctA)}`);

  const pctOutro = pagador === 'A' ? CEM_POR_CENTO - pctA : pctA;
  const absoluto = Math.abs(valor);
  const produto = absoluto * pctOutro; // inteiro exato (< 2^53)
  const cotaOutroAbs = (produto - (produto % CEM_POR_CENTO)) / CEM_POR_CENTO;
  const cotaOutro = valor < 0 ? -cotaOutroAbs : cotaOutroAbs;
  const cotaPagador = valor - cotaOutro;

  return pagador === 'A' ? { A: cotaPagador, B: cotaOutro } : { A: cotaOutro, B: cotaPagador };
}
