import { somarMeses } from './competencia.ts';
import type { Centavos } from './dinheiro.ts';
import { categoriaPorId, despesasDoMes, type Categoria, type Estado } from './estado.ts';
import { resumirMes } from './saldo.ts';
import type { Competencia, Pessoa } from './tipos.ts';

export interface GastoCategoria {
  readonly categoria: Categoria | undefined;
  readonly categoriaId: string;
  readonly total: Centavos;
}

/** Gasto por categoria no mês, do maior para o menor. */
export function gastoPorCategoria(estado: Estado, livro: string, c: Competencia): GastoCategoria[] {
  const totais = new Map<string, Centavos>();
  for (const d of resumirMes(c, despesasDoMes(estado, livro, c)).contadas) {
    totais.set(d.categoriaId, (totais.get(d.categoriaId) ?? 0) + d.valor);
  }
  return [...totais.entries()]
    .map(([categoriaId, total]) => ({ categoriaId, categoria: categoriaPorId(estado, categoriaId), total }))
    .sort((a, b) => b.total - a.total);
}

export interface TotalMes {
  readonly competencia: Competencia;
  readonly total: Centavos;
  readonly pagoPor: Readonly<Record<Pessoa, Centavos>>;
}

/** Totais dos últimos "quantidade" meses até "ate" (comparação entre meses). */
export function totaisPorMes(estado: Estado, livro: string, ate: Competencia, quantidade: number): TotalMes[] {
  const lista: TotalMes[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    const c = somarMeses(ate, -i);
    const r = resumirMes(c, despesasDoMes(estado, livro, c));
    lista.push({ competencia: c, total: r.totalGasto, pagoPor: r.pagoPor });
  }
  return lista;
}
