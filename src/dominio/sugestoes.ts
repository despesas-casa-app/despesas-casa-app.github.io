import type { Despesa, Estado } from './estado.ts';
import type { DataISO, Pessoa, PontosBase } from './tipos.ts';

/**
 * Sugestões locais (especificação 8): aprende com o histórico.
 * - descrição normalizada → frequência de categoria, % e quem pagou;
 * - busca aproximada: sem acento, sem caixa, por palavras, pelo começo das palavras e tolerando um
 *   erro de digitação em palavras maiores ("mercdo" acha "Mercado");
 * - ranking por frequência e recência (o que foi usado há pouco pesa mais);
 * - para descrições novas, a categoria é prevista pelas palavras ("Padaria do bairro" → a categoria
 *   de "Padaria").
 * Só ensinam os lançamentos feitos à mão (e, no futuro, os importados). Roda 100% no aparelho.
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

function palavras(texto: string): string[] {
  return normalizarTexto(texto).split(' ').filter(Boolean);
}

/** Meia-vida da recência: o que foi usado há 90 dias vale metade do que foi usado hoje. */
const MEIA_VIDA_DIAS = 90;

function pesoRecencia(data: DataISO, hoje: DataISO): number {
  const dias = Math.max(0, (Date.parse(hoje) - Date.parse(data)) / 86_400_000);
  return Number.isFinite(dias) ? 0.5 ** (dias / MEIA_VIDA_DIAS) : 0;
}

/** Distância de edição com no máximo 1 erro (troca, falta, sobra ou inversão de letras). */
export function umErroNoMaximo(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    const restoA = a.slice(i + 1);
    const restoB = b.slice(i + 1);
    if (restoA === restoB) return true; // uma letra trocada
    // duas letras invertidas ("mecrado")
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [maior, menor] = a.length > b.length ? [a, b] : [b, a];
  return maior.slice(i + 1) === menor.slice(i); // uma letra a mais ou a menos
}

/**
 * Quanto uma palavra digitada combina com uma palavra da descrição:
 * 1 = começo exato; 0,5 = começo com um erro de digitação (só a partir de 4 letras); 0 = não combina.
 */
export function combinacaoDaPalavra(digitada: string, palavra: string): number {
  if (palavra.startsWith(digitada)) return 1;
  if (digitada.length < 4) return 0;
  for (const tamanho of [digitada.length - 1, digitada.length, digitada.length + 1]) {
    if (tamanho >= 3 && umErroNoMaximo(digitada, palavra.slice(0, tamanho))) return 0.5;
  }
  return 0;
}

/** Cada palavra da busca precisa combinar com alguma palavra da descrição. Devolve a força (0 a 1). */
function combinacao(busca: readonly string[], chave: string): number {
  const ps = chave.split(' ');
  let total = 1;
  for (const b of busca) {
    const melhor = Math.max(0, ...ps.map((p) => combinacaoDaPalavra(b, p)));
    if (melhor === 0) return 0;
    total = Math.min(total, melhor);
  }
  return total;
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

interface Contagem {
  n: number;
  peso: number;
  ultima: string;
}

interface Grupo {
  descricao: string;
  ultimaData: string;
  vezes: number;
  peso: number;
  categorias: Map<string, Contagem>;
  pagadores: Map<Pessoa, Contagem>;
  pcts: Map<string, Contagem & { pctA: PontosBase; pctPadrao: boolean }>;
}

/** O mais usado, pesando a recência; empate → o mais recente. */
function maisFrequente<K, V extends Contagem>(mapa: Map<K, V>): V & { chave: K } {
  let melhor: (V & { chave: K }) | null = null;
  for (const [chave, v] of mapa) {
    if (!melhor || v.peso > melhor.peso + 1e-9 || (Math.abs(v.peso - melhor.peso) <= 1e-9 && v.ultima > melhor.ultima)) {
      melhor = { ...v, chave };
    }
  }
  if (!melhor) throw new Error('mapa vazio');
  return melhor;
}

function contar<K, V extends Contagem>(mapa: Map<K, V>, chave: K, data: string, peso: number, novo: () => V): void {
  const atual = mapa.get(chave);
  if (atual) {
    atual.n += 1;
    atual.peso += peso;
    if (data > atual.ultima) atual.ultima = data;
  } else {
    mapa.set(chave, { ...novo(), n: 1, peso, ultima: data });
  }
}

/** Só o que foi digitado à mão ensina: parcelas e recorrentes são lançadas sozinhas. */
function ensinam(despesas: readonly Despesa[]): Despesa[] {
  return despesas.filter((d) => !d.excluida && d.origem.tipo === 'manual');
}

function dataMaisRecente(despesas: readonly Despesa[]): DataISO {
  let maior = '';
  for (const d of despesas) if (d.data > maior) maior = d.data;
  return maior || '2000-01-01';
}

function agrupar(despesas: readonly Despesa[], hoje: DataISO): Map<string, Grupo> {
  const grupos = new Map<string, Grupo>();
  for (const d of despesas) {
    const chave = normalizarTexto(d.descricao);
    if (chave === '') continue;
    let g = grupos.get(chave);
    if (!g) {
      g = { descricao: d.descricao, ultimaData: d.data, vezes: 0, peso: 0, categorias: new Map(), pagadores: new Map(), pcts: new Map() };
      grupos.set(chave, g);
    }
    const peso = pesoRecencia(d.data, hoje);
    g.vezes += 1;
    g.peso += peso;
    if (d.data >= g.ultimaData) {
      g.ultimaData = d.data;
      g.descricao = d.descricao;
    }
    const base = (): Contagem => ({ n: 0, peso: 0, ultima: '' });
    contar(g.categorias, d.categoriaId, d.data, peso, base);
    contar(g.pagadores, d.pagador, d.data, peso, base);
    contar(g.pcts, `${String(d.pctA)}|${String(d.pctPadrao)}`, d.data, peso, () => ({ ...base(), pctA: d.pctA, pctPadrao: d.pctPadrao }));
  }
  return grupos;
}

/**
 * Sugestões para o que está sendo digitado. Ranking: quem começa igual ao texto primeiro, depois
 * a força da combinação, a frequência e a recência. Sem texto, devolve as mais usadas.
 */
export function sugerir(estado: Estado, texto: string, limite = 5): Sugestao[] {
  const busca = palavras(texto);
  const inicio = normalizarTexto(texto);
  const ativas = new Set(estado.categorias.filter((c) => c.ativa).map((c) => c.id));
  const fonte = ensinam(estado.despesas);
  const hoje = dataMaisRecente(fonte);
  const candidatos: { s: Sugestao; pontos: number }[] = [];

  for (const [chave, g] of agrupar(fonte, hoje)) {
    const forca = busca.length === 0 ? 1 : combinacao(busca, chave);
    if (forca === 0) continue;
    const categoria = maisFrequente(g.categorias);
    if (!ativas.has(categoria.chave)) continue;
    const pagador = maisFrequente(g.pagadores);
    const pct = maisFrequente(g.pcts);
    const comecaIgual = inicio !== '' && chave.startsWith(inicio) ? 1000 : 0;
    candidatos.push({
      pontos: comecaIgual + forca * 100 + g.peso * 10 + g.vezes * 0.01,
      s: { descricao: g.descricao, categoriaId: categoria.chave, pagador: pagador.chave, pctA: pct.pctA, pctPadrao: pct.pctPadrao, vezes: g.vezes },
    });
  }
  return candidatos
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map((c) => c.s);
}

/**
 * Para uma descrição NOVA, prevê a categoria pelas palavras já usadas antes. Só responde quando
 * há confiança (a categoria vencedora tem ao menos 60% dos votos). Palavras curtas (até 2 letras,
 * como "de", "da") não votam.
 */
export function preverCategoria(estado: Estado, texto: string): string | null {
  const busca = palavras(texto).filter((p) => p.length >= 3);
  if (busca.length === 0) return null;
  const ativas = new Set(estado.categorias.filter((c) => c.ativa).map((c) => c.id));
  const fonte = ensinam(estado.despesas);
  const hoje = dataMaisRecente(fonte);
  const votos = new Map<string, number>();
  for (const d of fonte) {
    if (!ativas.has(d.categoriaId)) continue;
    const ps = palavras(d.descricao);
    const forca = Math.max(0, ...busca.map((b) => Math.max(0, ...ps.map((p) => (p.length >= 3 ? combinacaoDaPalavra(b, p) : 0)))));
    if (forca > 0) votos.set(d.categoriaId, (votos.get(d.categoriaId) ?? 0) + forca * (0.5 + pesoRecencia(d.data, hoje)));
  }
  let total = 0;
  let melhor: [string, number] | null = null;
  for (const [id, v] of votos) {
    total += v;
    if (!melhor || v > melhor[1]) melhor = [id, v];
  }
  return melhor && melhor[1] / total >= 0.6 ? melhor[0] : null;
}

/** Categorias em ordem de uso (com peso para o recente), para mostrar primeiro as mais prováveis. */
export function categoriasMaisUsadas(estado: Estado): string[] {
  const fonte = ensinam(estado.despesas);
  const hoje = dataMaisRecente(fonte);
  const contagem = new Map<string, Contagem>();
  for (const d of fonte) contar(contagem, d.categoriaId, d.data, pesoRecencia(d.data, hoje), () => ({ n: 0, peso: 0, ultima: '' }));
  return [...contagem.entries()]
    .sort((a, b) => b[1].peso - a[1].peso || (a[1].ultima < b[1].ultima ? 1 : -1))
    .map(([id]) => id);
}
