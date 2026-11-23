import type { Despesa, Estado } from './estado.ts';
import type { Pessoa, PontosBase } from './tipos.ts';

/**
 * Sugestões locais (especificação 8): aprende com o histórico.
 * Descrição normalizada → frequência de categoria, % e quem pagou, com peso para o mais recente.
 * Roda 100% no aparelho.
 */

/** Sem acento, sem caixa, espaços simples. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface Sugestao {
  /** Descrição como foi digitada da última vez. */
  readonly descricao: string;
  readonly categoriaId: string;
  readonly pagador: Pessoa;
  readonly pctA: PontosBase;
  /** Se o % mais usado era o padrão da categoria. */
  readonly pctPadrao: boolean;
  readonly vezes: number;
}

interface Grupo {
  descricao: string;
  ultimaData: string;
  vezes: number;
  categorias: Map<string, { n: number; ultima: string }>;
  pagadores: Map<Pessoa, { n: number; ultima: string }>;
  pcts: Map<string, { n: number; ultima: string; pctA: PontosBase; pctPadrao: boolean }>;
}

function maisFrequente<K, V extends { n: number; ultima: string }>(mapa: Map<K, V>): V & { chave: K } {
  let melhor: (V & { chave: K }) | null = null;
  for (const [chave, v] of mapa) {
    if (!melhor || v.n > melhor.n || (v.n === melhor.n && v.ultima > melhor.ultima)) melhor = { ...v, chave };
  }
  if (!melhor) throw new Error('mapa vazio');
  return melhor;
}

function contar<K>(mapa: Map<K, { n: number; ultima: string }>, chave: K, data: string): void {
  const atual = mapa.get(chave);
  if (atual) {
    atual.n += 1;
    if (data > atual.ultima) atual.ultima = data;
  } else mapa.set(chave, { n: 1, ultima: data });
}

function agrupar(despesas: readonly Despesa[]): Map<string, Grupo> {
  const grupos = new Map<string, Grupo>();
  for (const d of despesas) {
    // Só o que foi digitado à mão ensina: parcelas e recorrentes são lançadas sozinhas.
    if (d.excluida || d.origem.tipo !== 'manual') continue;
    const chave = normalizarTexto(d.descricao);
    if (chave === '') continue;
    let g = grupos.get(chave);
    if (!g) {
      g = { descricao: d.descricao, ultimaData: d.data, vezes: 0, categorias: new Map(), pagadores: new Map(), pcts: new Map() };
      grupos.set(chave, g);
    }
    g.vezes += 1;
    if (d.data >= g.ultimaData) {
      g.ultimaData = d.data;
      g.descricao = d.descricao;
    }
    contar(g.categorias, d.categoriaId, d.data);
    contar(g.pagadores, d.pagador, d.data);
    const chavePct = `${String(d.pctA)}|${String(d.pctPadrao)}`;
    const pct = g.pcts.get(chavePct);
    if (pct) {
      pct.n += 1;
      if (d.data > pct.ultima) pct.ultima = d.data;
    } else g.pcts.set(chavePct, { n: 1, ultima: d.data, pctA: d.pctA, pctPadrao: d.pctPadrao });
  }
  return grupos;
}

/** Cada palavra da busca precisa ser o começo de alguma palavra da descrição. */
function combina(busca: readonly string[], chave: string): boolean {
  const palavras = chave.split(' ');
  return busca.every((b) => palavras.some((p) => p.startsWith(b)));
}

/**
 * Sugestões para o que está sendo digitado. Ranking: quem começa igual primeiro, depois
 * frequência e recência. Sem texto, devolve as mais usadas.
 */
export function sugerir(estado: Estado, texto: string, limite = 5): Sugestao[] {
  const busca = normalizarTexto(texto).split(' ').filter(Boolean);
  const inicio = normalizarTexto(texto);
  const ativas = new Set(estado.categorias.filter((c) => c.ativa).map((c) => c.id));
  const candidatos: { s: Sugestao; pontos: number }[] = [];

  for (const [chave, g] of agrupar(estado.despesas)) {
    if (busca.length > 0 && !combina(busca, chave)) continue;
    const categoria = maisFrequente(g.categorias);
    if (!ativas.has(categoria.chave)) continue;
    const pagador = maisFrequente(g.pagadores);
    const pct = maisFrequente(g.pcts);
    const recencia = Date.parse(g.ultimaData) / 86_400_000; // dias
    const pontos = (inicio !== '' && chave.startsWith(inicio) ? 1_000_000 : 0) + g.vezes * 30 + recencia / 1000;
    candidatos.push({
      pontos,
      s: {
        descricao: g.descricao,
        categoriaId: categoria.chave,
        pagador: pagador.chave,
        pctA: pct.pctA,
        pctPadrao: pct.pctPadrao,
        vezes: g.vezes,
      },
    });
  }
  return candidatos
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map((c) => c.s);
}

/** Categorias em ordem de uso recente (para mostrar primeiro as mais prováveis). */
export function categoriasMaisUsadas(estado: Estado): string[] {
  const contagem = new Map<string, { n: number; ultima: string }>();
  for (const d of estado.despesas) {
    if (!d.excluida && d.origem.tipo === 'manual') contar(contagem, d.categoriaId, d.data);
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1].n - a[1].n || (a[1].ultima < b[1].ultima ? 1 : -1))
    .map(([id]) => id);
}
