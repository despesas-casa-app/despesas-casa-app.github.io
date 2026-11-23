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

export interface ComparacaoCategoria {
  readonly categoriaId: string;
  readonly categoria: Categoria | undefined;
  readonly total: Centavos;
  /** Total da mesma categoria no mês anterior. */
  readonly anterior: Centavos;
  /** Média mensal da categoria nos 6 meses anteriores (contando meses sem gasto). */
  readonly media: Centavos;
}

/**
 * Gasto por categoria no mês, comparado ao mês anterior e à média dos 6 meses anteriores.
 * Inclui categorias que tiveram gasto só no mês anterior (total 0), para mostrar a queda.
 */
export function comparacaoPorCategoria(estado: Estado, livro: string, c: Competencia): ComparacaoCategoria[] {
  const somar = (comp: Competencia): Map<string, Centavos> => {
    const m = new Map<string, Centavos>();
    for (const g of gastoPorCategoria(estado, livro, comp)) m.set(g.categoriaId, g.total);
    return m;
  };
  const atual = somar(c);
  const anterior = somar(somarMeses(c, -1));
  const historico = Array.from({ length: 6 }, (_, i) => somar(somarMeses(c, -(i + 1))));
  const ids = new Set([...atual.keys(), ...anterior.keys()]);
  return [...ids]
    .map((id) => ({
      categoriaId: id,
      categoria: categoriaPorId(estado, id),
      total: atual.get(id) ?? 0,
      anterior: anterior.get(id) ?? 0,
      media: Math.round(historico.reduce((s, m) => s + (m.get(id) ?? 0), 0) / historico.length),
    }))
    .sort((a, b) => b.total - a.total || b.anterior - a.anterior);
}

/** Variação percentual inteira (ex.: +12, -30). null quando não há base de comparação. */
export function variacao(atual: Centavos, base: Centavos): number | null {
  if (base <= 0) return null;
  return Math.round(((atual - base) / base) * 100);
}
