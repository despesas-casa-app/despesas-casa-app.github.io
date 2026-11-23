import { competencia, competenciaDaData, ehDataValida } from './competencia.ts';
import { invalido, novoEvento, sucesso, type Contexto, type Resultado } from './contexto.ts';
import { lerCsv } from './csv.ts';
import { camposNovaDespesa, type DadosDespesa } from './despesas.ts';
import type { Centavos } from './dinheiro.ts';
import { dividir } from './divisao.ts';
import type { Evento } from './eventos.ts';
import { categoriaPorId, lerEstado, mesFechado, type Categoria, type Estado } from './estado.ts';
import { fecharMes } from './fechamento.ts';
import { CEM_POR_CENTO, METADE } from './percentual.ts';
import { projetar } from './projecao.ts';
import { normalizarTexto } from './sugestoes.ts';
import { LIVRO_CASA, type Competencia, type DataISO, type Pessoa, type PontosBase } from './tipos.ts';

/**
 * Importação do Tricount (especificação 9). O arquivo é lido no aparelho e nunca é enviado.
 *
 * Formato do CSV exportado pelo Tricount (em português): colunas "Título", "Valor na moeda padrão
 * (BRL)", "Tipo de transação" ("Despesa" ou "Transferência de dinheiro"), "Categoria", "Pago por",
 * uma coluna "Pago por <nome>" e uma "Impactado para <nome>" por pessoa (as partes vêm negativas),
 * e "Data e hora" ("21 de novembro de 2024 14:35"). Valores com ponto decimal ("1234.56").
 *
 * Regras:
 * - cada despesa vira uma despesa do app, com o % calculado a partir das partes;
 * - se as duas pessoas pagaram uma mesma despesa, ela vira duas (uma por quem pagou), mantendo o
 *   saldo exato;
 * - os meses ANTERIORES ao mês corrente entram fechados (os acertos do Tricount viram fechamentos);
 * - o que ainda está em aberto no fim do Tricount entra como "Saldo pendente do Tricount" no mês
 *   corrente, para o saldo do app ficar igual ao do Tricount;
 * - ids determinísticos: importar o mesmo arquivo de novo não duplica nada.
 */

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const COL_TITULO = 'título';
const COL_VALOR = 'valor na moeda padrão (brl)';
const COL_TIPO = 'tipo de transação';
const COL_CATEGORIA = 'categoria';
const COL_DATA = 'data e hora';
const PREFIXO_PAGO = 'pago por ';
const PREFIXO_IMPACTO = 'impactado para ';

export interface LinhaTricount {
  /** Número da linha no arquivo (para mensagens). */
  readonly numero: number;
  readonly titulo: string;
  readonly tipo: 'despesa' | 'transferencia';
  readonly valor: Centavos;
  readonly data: DataISO;
  readonly categoria: string;
  /** Quanto cada pessoa pagou. */
  readonly pagos: ReadonlyMap<string, Centavos>;
  /** Parte de cada pessoa (positiva). */
  readonly partes: ReadonlyMap<string, Centavos>;
  /** Texto original da linha, para o id determinístico. */
  readonly bruta: string;
}

export interface AnaliseTricount {
  /** Nomes das pessoas como aparecem no Tricount (exatamente 2). */
  readonly pessoas: readonly string[];
  readonly linhas: readonly LinhaTricount[];
  /** Linhas puladas (total, rodapé, formato estranho). */
  readonly ignoradas: readonly { readonly numero: number; readonly motivo: string }[];
  /** Categoria do Tricount → quantas despesas. */
  readonly categorias: ReadonlyMap<string, number>;
}

export class ErroImportacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroImportacao';
  }
}

/** "1234.56" / "-99.9" / "0" → centavos (sem ponto flutuante). Formato inválido → null. */
export function lerValorTricount(texto: string): Centavos | null {
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  const centavos = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -centavos : centavos;
}

/** "21 de novembro de 2024 14:35" → "2024-11-21". */
export function lerDataTricount(texto: string): DataISO | null {
  const m = /^(\d{1,2}) de ([a-z]+) de (\d{4})/.exec(normalizarTexto(texto));
  if (!m) return null;
  const mes = MESES.indexOf(m[2] ?? '');
  if (mes < 0) return null;
  const data = `${competencia(Number(m[3]), mes + 1)}-${(m[1] ?? '').padStart(2, '0')}`;
  return ehDataValida(data) ? data : null;
}

/** Lê o CSV do Tricount e organiza as linhas. Lança ErroImportacao se o arquivo não for reconhecido. */
export function analisarTricount(texto: string): AnaliseTricount {
  const tabela = lerCsv(texto);
  const cabecalho = (tabela[0] ?? []).map((c) => c.trim());
  const col = (nome: string): number => cabecalho.findIndex((c) => c.toLowerCase() === nome);
  const iTitulo = col(COL_TITULO);
  const iValor = col(COL_VALOR);
  const iTipo = col(COL_TIPO);
  const iCategoria = col(COL_CATEGORIA);
  const iData = col(COL_DATA);
  if ([iTitulo, iValor, iTipo, iData].some((i) => i < 0)) {
    throw new ErroImportacao('Este arquivo não parece uma exportação do Tricount (faltam colunas como "Título" e "Data e hora").');
  }
  const pessoasPago = cabecalho.flatMap((c, i) => (c.toLowerCase().startsWith(PREFIXO_PAGO) ? [{ nome: c.slice(PREFIXO_PAGO.length), i }] : []));
  const pessoasImpacto = new Map(
    cabecalho.flatMap((c, i) => (c.toLowerCase().startsWith(PREFIXO_IMPACTO) ? [[c.slice(PREFIXO_IMPACTO.length), i] as const] : [])),
  );
  const pessoas = pessoasPago.map((p) => p.nome).filter((n) => pessoasImpacto.has(n));
  if (pessoas.length !== 2) {
    throw new ErroImportacao(`O app é para 2 pessoas, mas o arquivo tem ${String(pessoas.length)}.`);
  }

  const linhas: LinhaTricount[] = [];
  const ignoradas: { numero: number; motivo: string }[] = [];
  const categorias = new Map<string, number>();
  tabela.slice(1).forEach((l, indice) => {
    const numero = indice + 2;
    const tipoTexto = (l[iTipo] ?? '').trim();
    const tipo = tipoTexto === 'Despesa' ? 'despesa' : tipoTexto === 'Transferência de dinheiro' ? 'transferencia' : null;
    if (!tipo) {
      ignoradas.push({ numero, motivo: 'não é despesa nem transferência (total ou rodapé)' });
      return;
    }
    const valor = lerValorTricount(l[iValor] ?? '');
    const data = lerDataTricount(l[iData] ?? '');
    if (valor === null || data === null) {
      ignoradas.push({ numero, motivo: 'valor ou data em formato desconhecido' });
      return;
    }
    const pagos = new Map<string, Centavos>();
    const partes = new Map<string, Centavos>();
    for (const p of pessoasPago) {
      if (!pessoas.includes(p.nome)) continue;
      pagos.set(p.nome, lerValorTricount(l[p.i] ?? '') ?? 0);
      partes.set(p.nome, -(lerValorTricount(l[pessoasImpacto.get(p.nome) ?? -1] ?? '') ?? 0));
    }
    const categoria = (l[iCategoria] ?? '').trim() || 'Sem categoria';
    if (tipo === 'despesa') categorias.set(categoria, (categorias.get(categoria) ?? 0) + 1);
    linhas.push({ numero, titulo: (l[iTitulo] ?? '').trim() || 'Sem título', tipo, valor, data, categoria, pagos, partes, bruta: l.join('\u0001') });
  });
  return { pessoas, linhas, ignoradas, categorias };
}

// ---------------------------------------------------------------------------------------------
// Mapeamento de categorias
// ---------------------------------------------------------------------------------------------

/** Sinônimos comuns entre as categorias do Tricount e as do app. */
const SINONIMOS: Readonly<Record<string, string>> = {
  shopping: 'compras',
  transport: 'transporte',
  transportes: 'transporte',
  viagem: 'viagens',
  aluguel: 'moradia',
  supermercado: 'despesas da casa',
  mercado: 'despesas da casa',
  casorio: 'casamento',
  restaurantes: 'entretenimento',
  lazer: 'entretenimento',
  pets: 'gatinhos',
  outro: 'outros',
  'sem categoria': 'outros',
};

function semEmoji(nome: string): string {
  return normalizarTexto(nome);
}

/** Sugere a categoria do app para cada categoria do Tricount (a pessoa confere na prévia). */
export function sugerirCategorias(nomesTricount: Iterable<string>, categorias: readonly Categoria[]): Map<string, string> {
  const ativas = categorias.filter((c) => c.ativa);
  const porNome = new Map(ativas.map((c) => [semEmoji(c.nome), c.id]));
  const outros = porNome.get('outros') ?? ativas.at(-1)?.id ?? '';
  const resultado = new Map<string, string>();
  for (const nome of nomesTricount) {
    const n = semEmoji(nome);
    const primeira = n.split(' ')[0] ?? '';
    const alvo =
      porNome.get(n) ??
      porNome.get(SINONIMOS[n] ?? '') ??
      porNome.get(SINONIMOS[primeira] ?? '') ??
      ativas.find((c) => {
        const cn = semEmoji(c.nome);
        return n.length >= 4 && (cn.startsWith(n.slice(0, 4)) || n.startsWith(cn.slice(0, 4)));
      })?.id ??
      outros;
    resultado.set(nome, alvo);
  }
  return resultado;
}

// ---------------------------------------------------------------------------------------------
// Plano da importação (prévia) e eventos
// ---------------------------------------------------------------------------------------------

export interface OpcoesImportacao {
  /** Nome no Tricount → Pessoa A ou B no app. */
  readonly pessoaDe: Readonly<Record<string, Pessoa>>;
  /** Categoria do Tricount → id da categoria no app. */
  readonly categoriaDe: Readonly<Record<string, string>>;
  /** Mês corrente: os anteriores entram fechados. */
  readonly mesCorrente: Competencia;
  /** Data de hoje (para o lançamento do saldo pendente). */
  readonly hoje: DataISO;
}

export interface DespesaPlanejada {
  readonly id: string;
  readonly dados: DadosDespesa;
}

export interface ResumoMesImportado {
  readonly competencia: Competencia;
  readonly quantidade: number;
  readonly total: Centavos;
  readonly fechado: boolean;
}

export interface PlanoImportacao {
  readonly despesas: readonly DespesaPlanejada[];
  readonly mesesFechar: readonly Competencia[];
  /** Lançamento que acerta o saldo pendente (null se o Tricount terminou zerado). */
  readonly ajuste: DespesaPlanejada | null;
  /** Saldo final da Pessoa A no Tricount (positivo: A tem a receber). */
  readonly saldoFinalA: Centavos;
  readonly porMes: readonly ResumoMesImportado[];
  readonly transferencias: number;
  /** Despesas pagas pelas duas pessoas (divididas em duas). */
  readonly divididas: number;
  /** Despesas que já existem no app (importadas antes) e serão puladas. */
  readonly jaImportadas: number;
  /** Meses passados que já estavam fechados no app e vão receber despesas importadas. */
  readonly mesesJaFechados: readonly Competencia[];
}

/** Hash de 53 bits (cyrb53), para ids determinísticos. */
function hash(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** % da Pessoa A a partir das partes (arredondado a 2 casas). */
function pctDaPessoaA(parteA: Centavos, total: Centavos): PontosBase {
  if (total <= 0) return METADE;
  const p = Math.round((parteA * CEM_POR_CENTO) / total);
  return Math.min(CEM_POR_CENTO, Math.max(0, p));
}

export function planejarImportacao(analise: AnaliseTricount, opcoes: OpcoesImportacao, estado: Estado): PlanoImportacao {
  const nomeDe = (p: Pessoa): string => {
    const nome = analise.pessoas.find((n) => opcoes.pessoaDe[n] === p);
    if (!nome) throw new ErroImportacao('Escolha quem é quem: cada pessoa do Tricount precisa ser uma pessoa diferente do app.');
    return nome;
  };
  const nomeA = nomeDe('A');
  const nomeB = nomeDe('B');
  const existentes = new Set(estado.despesas.map((d) => d.id));
  const vistas = new Map<string, number>();
  const despesas: DespesaPlanejada[] = [];
  let saldoFinalA = 0;
  let transferencias = 0;
  let divididas = 0;
  let jaImportadas = 0;

  for (const l of analise.linhas) {
    // Saldo final do Tricount (despesas e transferências): o que pagou − a parte de cada um.
    saldoFinalA += (l.pagos.get(nomeA) ?? 0) - (l.partes.get(nomeA) ?? 0);
    if (l.tipo === 'transferencia') {
      transferencias += 1;
      continue;
    }
    if (l.valor <= 0) continue;
    const ocorrencia = (vistas.get(l.bruta) ?? 0) + 1;
    vistas.set(l.bruta, ocorrencia);
    const base = `tri_${hash(`${l.bruta}#${String(ocorrencia)}`)}`;
    const parteA = l.partes.get(nomeA) ?? 0;
    const totalPartes = parteA + (l.partes.get(nomeB) ?? 0);
    const pctA = pctDaPessoaA(parteA, totalPartes > 0 ? totalPartes : l.valor);
    const categoriaId = opcoes.categoriaDe[l.categoria] ?? '';
    const pagadores = ([['A', nomeA], ['B', nomeB]] as const).filter(([, n]) => (l.pagos.get(n) ?? 0) > 0);
    if (pagadores.length === 0) continue;
    if (pagadores.length > 1) divididas += 1;
    for (const [pessoa, nome] of pagadores) {
      const id = pagadores.length > 1 ? `${base}_${pessoa}` : base;
      if (existentes.has(id)) {
        jaImportadas += 1;
        continue;
      }
      despesas.push({
        id,
        dados: {
          valor: l.pagos.get(nome) ?? 0,
          descricao: l.titulo.slice(0, 120),
          data: l.data,
          competencia: competenciaDaData(l.data),
          categoriaId,
          pagador: pessoa,
          pctA,
          pctPadrao: pctA === categoriaPorId(estado, categoriaId)?.pctA,
        },
      });
    }
  }

  // Resumo por mês e meses que entram fechados.
  const porMesMapa = new Map<Competencia, { quantidade: number; total: Centavos }>();
  for (const d of despesas) {
    const m = porMesMapa.get(d.dados.competencia) ?? { quantidade: 0, total: 0 };
    m.quantidade += 1;
    m.total += d.dados.valor;
    porMesMapa.set(d.dados.competencia, m);
  }
  const mesesFechar = [...porMesMapa.keys()]
    .filter((c) => c < opcoes.mesCorrente && !mesFechado(estado, LIVRO_CASA, c))
    .sort();
  const mesesJaFechados = [...porMesMapa.keys()].filter((c) => mesFechado(estado, LIVRO_CASA, c)).sort();
  const porMes = [...porMesMapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([c, m]) => ({ competencia: c, ...m, fechado: c < opcoes.mesCorrente }));

  // Saldo do que fica em aberto (mês corrente em diante), para o ajuste igualar ao Tricount.
  let saldoAbertoA = 0;
  for (const d of despesas) {
    if (d.dados.competencia < opcoes.mesCorrente) continue;
    const cotas = dividir(d.dados.valor, d.dados.pctA, d.dados.pagador);
    saldoAbertoA += (d.dados.pagador === 'A' ? d.dados.valor : 0) - cotas.A;
  }
  const diferenca = saldoFinalA - saldoAbertoA;
  const outros = estado.categorias.find((c) => semEmoji(c.nome) === 'outros')?.id ?? estado.categorias[0]?.id ?? '';
  const ajuste: DespesaPlanejada | null =
    diferenca === 0
      ? null
      : {
          id: `tri_ajuste_${hash(analise.linhas.map((l) => l.bruta).join('\n'))}`,
          dados: {
            valor: Math.abs(diferenca),
            descricao: 'Saldo pendente do Tricount',
            data: opcoes.hoje,
            competencia: opcoes.mesCorrente,
            categoriaId: outros,
            // Quem tem a receber "pagou"; a parte toda fica com quem deve.
            pagador: diferenca > 0 ? 'A' : 'B',
            pctA: diferenca > 0 ? 0 : CEM_POR_CENTO,
            pctPadrao: false,
          },
        };
  const ajusteValido = ajuste && !existentes.has(ajuste.id) ? ajuste : null;

  return { despesas, mesesFechar, ajuste: ajusteValido, saldoFinalA, porMes, transferencias, divididas, jaImportadas, mesesJaFechados };
}

/** Gera os eventos: as despesas (origem "importada"), o ajuste e os fechamentos dos meses passados. */
export function gerarEventosImportacao(plano: PlanoImportacao, estado: Estado, ctx: Contexto): Resultado {
  const semCategoria = [...plano.despesas, ...(plano.ajuste ? [plano.ajuste] : [])].find((d) => !categoriaPorId(estado, d.dados.categoriaId));
  if (semCategoria) return invalido('Escolha a categoria do app para todas as categorias do Tricount.');
  const eventos: Evento[] = [];
  for (const d of [...plano.despesas, ...(plano.ajuste ? [plano.ajuste] : [])]) {
    eventos.push(novoEvento(ctx, 'criar', 'despesa', d.id, camposNovaDespesa(d.dados, { tipo: 'importada' })));
  }
  let projetado = lerEstado(projetar([...estado.projecao.eventos, ...eventos]));
  for (const c of plano.mesesFechar) {
    const r = fecharMes(projetado, LIVRO_CASA, c, ctx);
    if (!r.ok) continue;
    const marcados = r.eventos.map((e) => ({ ...e, campos: { ...e.campos, importado: true } }));
    eventos.push(...marcados);
    projetado = lerEstado(projetar([...projetado.projecao.eventos, ...marcados]));
  }
  return sucesso(eventos);
}
