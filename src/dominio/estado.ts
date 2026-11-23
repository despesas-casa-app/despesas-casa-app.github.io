import type { Centavos } from './dinheiro.ts';
import type { ValorCampo } from './eventos.ts';
import { registrosDe, type Projecao, type Registro } from './projecao.ts';
import { METADE } from './percentual.ts';
import {
  LIVRO_CASA,
  ehPessoa,
  type Competencia,
  type DataISO,
  type Pessoa,
  type PontosBase,
} from './tipos.ts';

// ---------------------------------------------------------------------------------------------
// Entidades já "tipadas", lidas a partir dos registros genéricos da projeção.
// ---------------------------------------------------------------------------------------------

export interface Config {
  readonly nomeA: string;
  readonly nomeB: string;
  readonly moeda: 'BRL';
}

export interface Categoria {
  readonly id: string;
  readonly nome: string;
  readonly icone: string;
  readonly cor: string;
  /** Divisão padrão: % da Pessoa A. */
  readonly pctA: PontosBase;
  readonly ativa: boolean;
  readonly ordem: number;
}

export type Origem =
  | { readonly tipo: 'manual' }
  | { readonly tipo: 'recorrente'; readonly id: string }
  | { readonly tipo: 'parcela'; readonly id: string; readonly k: number; readonly n: number };

export type StatusDespesa = 'normal' | 'aguardando';

export interface Despesa {
  readonly id: string;
  readonly livro: string;
  readonly valor: Centavos;
  readonly descricao: string;
  readonly data: DataISO;
  readonly competencia: Competencia;
  readonly categoriaId: string;
  readonly pagador: Pessoa;
  /** % da Pessoa A gravado na própria despesa. */
  readonly pctA: PontosBase;
  /** Se o % ainda é o padrão da categoria (para a pergunta ao mudar o % da categoria). */
  readonly pctPadrao: boolean;
  readonly origem: Origem;
  readonly status: StatusDespesa;
  readonly excluida: boolean;
  readonly criadoPor: Pessoa;
  readonly criadoEm: string;
  readonly alteradoPor: Pessoa;
  readonly alteradoEm: string;
  readonly editada: boolean;
}

export interface Recorrente {
  readonly id: string;
  readonly descricao: string;
  readonly categoriaId: string;
  readonly pagador: Pessoa;
  readonly tipoValor: 'fixo' | 'variavel';
  readonly valor: Centavos;
  readonly dia: number;
  readonly inicio: Competencia;
  readonly fim: Competencia | null;
  /** null = usa o % da categoria no momento de gerar. */
  readonly pctA: PontosBase | null;
  readonly ativa: boolean;
  readonly excluida: boolean;
}

export interface Parcelamento {
  readonly id: string;
  readonly descricao: string;
  readonly categoriaId: string;
  readonly pagador: Pessoa;
  readonly valorTotal: Centavos;
  readonly n: number;
  readonly primeiraCompetencia: Competencia;
  readonly dataCompra: DataISO;
  readonly pctA: PontosBase;
  readonly status: 'ativo' | 'cancelado';
}

export interface Fechamento {
  readonly id: string;
  readonly livro: string;
  readonly competencia: Competencia;
  readonly status: 'fechado' | 'aberto';
  readonly totalGasto: Centavos;
  readonly saldoA: Centavos;
  readonly transferenciaDe: Pessoa | null;
  readonly valorTransferencia: Centavos;
  /** Ids das despesas que entraram na conta do fechamento. */
  readonly despesasContadas: readonly string[];
  readonly data: DataISO;
  readonly fechadoPor: Pessoa;
}

export interface Estado {
  readonly config: Config;
  /** Em ordem de exibição. Inclui as arquivadas. */
  readonly categorias: readonly Categoria[];
  /** Inclui as excluídas (para histórico e idempotência). */
  readonly despesas: readonly Despesa[];
  readonly recorrentes: readonly Recorrente[];
  readonly parcelamentos: readonly Parcelamento[];
  readonly fechamentos: readonly Fechamento[];
  readonly projecao: Projecao;
}

// ---------------------------------------------------------------------------------------------
// Leitura segura de campos (dados antigos ou incompletos nunca quebram o app)
// ---------------------------------------------------------------------------------------------

type C = Readonly<Record<string, ValorCampo>>;

function texto(c: C, k: string, padrao = ''): string {
  const v = c[k];
  return typeof v === 'string' ? v : padrao;
}

function inteiro(c: C, k: string, padrao = 0): number {
  const v = c[k];
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : padrao;
}

function inteiroOuNulo(c: C, k: string): number | null {
  const v = c[k];
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : null;
}

function booleano(c: C, k: string, padrao = false): boolean {
  const v = c[k];
  return typeof v === 'boolean' ? v : padrao;
}

function pessoa(c: C, k: string, padrao: Pessoa = 'A'): Pessoa {
  const v = c[k];
  return ehPessoa(v) ? v : padrao;
}

export const NOMES_PADRAO = { nomeA: 'Pessoa A', nomeB: 'Pessoa B' } as const;
export const ID_CONFIG = 'config';

function lerConfig(r: Registro | undefined): Config {
  const c = r?.campos ?? {};
  return {
    nomeA: texto(c, 'nomeA', NOMES_PADRAO.nomeA) || NOMES_PADRAO.nomeA,
    nomeB: texto(c, 'nomeB', NOMES_PADRAO.nomeB) || NOMES_PADRAO.nomeB,
    moeda: 'BRL',
  };
}

function lerCategoria(r: Registro): Categoria {
  const c = r.campos;
  return {
    id: r.id,
    nome: texto(c, 'nome', 'Sem nome'),
    icone: texto(c, 'icone', '•'),
    cor: texto(c, 'cor', '#9ca3af'),
    pctA: inteiro(c, 'pctA', METADE),
    ativa: booleano(c, 'ativa', true),
    ordem: inteiro(c, 'ordem', 0),
  };
}

function lerOrigem(c: C): Origem {
  const tipo = texto(c, 'origemTipo', 'manual');
  const id = texto(c, 'origemId');
  if (tipo === 'recorrente' && id) return { tipo, id };
  if (tipo === 'parcela' && id) return { tipo, id, k: inteiro(c, 'parcelaK', 1), n: inteiro(c, 'parcelaN', 1) };
  return { tipo: 'manual' };
}

function lerDespesa(r: Registro): Despesa {
  const c = r.campos;
  return {
    id: r.id,
    livro: texto(c, 'livro', LIVRO_CASA),
    valor: inteiro(c, 'valor'),
    descricao: texto(c, 'descricao'),
    data: texto(c, 'data'),
    competencia: texto(c, 'competencia'),
    categoriaId: texto(c, 'categoriaId'),
    pagador: pessoa(c, 'pagador'),
    pctA: inteiro(c, 'pctA', METADE),
    pctPadrao: booleano(c, 'pctPadrao', false),
    origem: lerOrigem(c),
    status: texto(c, 'status') === 'aguardando' ? 'aguardando' : 'normal',
    excluida: booleano(c, 'excluida'),
    criadoPor: r.criadoPor,
    criadoEm: r.criadoEm,
    alteradoPor: r.alteradoPor,
    alteradoEm: r.alteradoEm,
    editada: r.editado,
  };
}

function lerRecorrente(r: Registro): Recorrente {
  const c = r.campos;
  const fim = texto(c, 'fim');
  return {
    id: r.id,
    descricao: texto(c, 'descricao'),
    categoriaId: texto(c, 'categoriaId'),
    pagador: pessoa(c, 'pagador'),
    tipoValor: texto(c, 'tipoValor') === 'variavel' ? 'variavel' : 'fixo',
    valor: inteiro(c, 'valor'),
    dia: inteiro(c, 'dia', 1),
    inicio: texto(c, 'inicio'),
    fim: fim === '' ? null : fim,
    pctA: inteiroOuNulo(c, 'pctA'),
    ativa: booleano(c, 'ativa', true),
    excluida: booleano(c, 'excluida'),
  };
}

function lerParcelamento(r: Registro): Parcelamento {
  const c = r.campos;
  return {
    id: r.id,
    descricao: texto(c, 'descricao'),
    categoriaId: texto(c, 'categoriaId'),
    pagador: pessoa(c, 'pagador'),
    valorTotal: inteiro(c, 'valorTotal'),
    n: inteiro(c, 'n', 1),
    primeiraCompetencia: texto(c, 'primeiraCompetencia'),
    dataCompra: texto(c, 'dataCompra'),
    pctA: inteiro(c, 'pctA', METADE),
    status: texto(c, 'status') === 'cancelado' ? 'cancelado' : 'ativo',
  };
}

function lerFechamento(r: Registro): Fechamento {
  const c = r.campos;
  const de = c['transferenciaDe'];
  const contadas = texto(c, 'despesasContadas');
  return {
    id: r.id,
    livro: texto(c, 'livro', LIVRO_CASA),
    competencia: texto(c, 'competencia'),
    status: texto(c, 'status') === 'fechado' ? 'fechado' : 'aberto',
    totalGasto: inteiro(c, 'totalGasto'),
    saldoA: inteiro(c, 'saldoA'),
    transferenciaDe: ehPessoa(de) ? de : null,
    valorTransferencia: inteiro(c, 'valorTransferencia'),
    despesasContadas: contadas === '' ? [] : contadas.split(','),
    data: texto(c, 'data'),
    fechadoPor: pessoa(c, 'fechadoPor'),
  };
}

export function lerEstado(projecao: Projecao): Estado {
  const config = lerConfig(projecao.registros.get(`config:${ID_CONFIG}`));
  const categorias = registrosDe(projecao, 'categoria')
    .map(lerCategoria)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    config,
    categorias,
    despesas: registrosDe(projecao, 'despesa').map(lerDespesa),
    recorrentes: registrosDe(projecao, 'recorrente').map(lerRecorrente),
    parcelamentos: registrosDe(projecao, 'parcelamento').map(lerParcelamento),
    fechamentos: registrosDe(projecao, 'fechamento').map(lerFechamento),
    projecao,
  };
}

// ---------------------------------------------------------------------------------------------
// Consultas comuns
// ---------------------------------------------------------------------------------------------

export function nomeDe(config: Config, p: Pessoa): string {
  return p === 'A' ? config.nomeA : config.nomeB;
}

export function categoriaPorId(estado: Estado, id: string): Categoria | undefined {
  return estado.categorias.find((c) => c.id === id);
}

export function despesaPorId(estado: Estado, id: string): Despesa | undefined {
  return estado.despesas.find((d) => d.id === id);
}

export function idFechamento(livro: string, c: Competencia): string {
  return `${livro}-${c}`;
}

export function fechamentoDe(estado: Estado, livro: string, c: Competencia): Fechamento | undefined {
  return estado.fechamentos.find((f) => f.id === idFechamento(livro, c));
}

export function mesFechado(estado: Estado, livro: string, c: Competencia): boolean {
  return fechamentoDe(estado, livro, c)?.status === 'fechado';
}

/** Despesas vivas (não excluídas) de um mês, da mais recente para a mais antiga. */
export function despesasDoMes(estado: Estado, livro: string, c: Competencia): Despesa[] {
  return estado.despesas
    .filter((d) => !d.excluida && d.livro === livro && d.competencia === c)
    .sort((a, b) => (a.data === b.data ? (a.criadoEm < b.criadoEm ? 1 : -1) : a.data < b.data ? 1 : -1));
}

/** Rótulo de exibição: "Sofá 3/10" para parcelas. */
export function rotuloDespesa(d: Despesa): string {
  return d.origem.tipo === 'parcela' ? `${d.descricao} ${String(d.origem.k)}/${String(d.origem.n)}` : d.descricao;
}
