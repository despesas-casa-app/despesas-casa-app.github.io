import { ehHlcValido } from './hlc.ts';
import { ehPessoa, type Pessoa } from './tipos.ts';

/**
 * Event sourcing (especificação 4.1): cada ação vira um evento imutável. O estado atual é a
 * "soma" de todos os eventos, aplicados em ordem de carimbo (HLC).
 *
 * Modelo único para todas as entidades:
 * - "criar": cria a entidade com os campos dados. Se já existir, é ignorado (vale o primeiro,
 *   isto é, o de menor HLC) — é o que torna recorrentes e parcelas idempotentes.
 * - "alterar": muda só os campos dados. Conflitos se resolvem campo a campo: vale o de maior HLC.
 *   Excluir é alterar o campo "excluida" para true.
 */
export const VERSAO_ESQUEMA = 1;

export const ENTIDADES = [
  'config',
  'categoria',
  'despesa',
  'recorrente',
  'parcelamento',
  'fechamento',
] as const;
export type Entidade = (typeof ENTIDADES)[number];

export type ValorCampo = string | number | boolean | null;
export type Campos = Readonly<Record<string, ValorCampo>>;

export interface Evento {
  /** Id único do próprio evento (não da entidade). */
  readonly id: string;
  readonly versao: number;
  readonly hlc: string;
  /** Quem fez a ação. */
  readonly autor: Pessoa;
  readonly tipo: 'criar' | 'alterar';
  readonly entidade: Entidade;
  readonly entidadeId: string;
  readonly campos: Campos;
}

export function chaveEntidade(entidade: Entidade, id: string): string {
  return `${entidade}:${id}`;
}

/** Ordem total e determinística: por HLC e, em empate, pelo id do evento. */
export function compararEventos(a: Evento, b: Evento): number {
  if (a.hlc !== b.hlc) return a.hlc < b.hlc ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function ehValorCampo(v: unknown): v is ValorCampo {
  return (
    v === null ||
    typeof v === 'string' ||
    typeof v === 'boolean' ||
    (typeof v === 'number' && Number.isFinite(v))
  );
}

/** Confere se um dado vindo de fora (banco local, planilha) tem o formato de um evento. */
export function ehEvento(x: unknown): x is Evento {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  if (typeof e['id'] !== 'string' || e['id'] === '') return false;
  if (typeof e['versao'] !== 'number') return false;
  if (!ehHlcValido(e['hlc'])) return false;
  if (!ehPessoa(e['autor'])) return false;
  if (e['tipo'] !== 'criar' && e['tipo'] !== 'alterar') return false;
  if (!ENTIDADES.includes(e['entidade'] as Entidade)) return false;
  if (typeof e['entidadeId'] !== 'string' || e['entidadeId'] === '') return false;
  const campos = e['campos'];
  if (typeof campos !== 'object' || campos === null || Array.isArray(campos)) return false;
  return Object.values(campos).every(ehValorCampo);
}
