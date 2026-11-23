import type { Competencia, DataISO } from './tipos.ts';

const RE_COMPETENCIA = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

export function ehCompetencia(valor: unknown): valor is Competencia {
  return typeof valor === 'string' && RE_COMPETENCIA.test(valor);
}

export function competencia(ano: number, mes: number): Competencia {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

export function partesCompetencia(c: Competencia): { ano: number; mes: number } {
  const m = RE_COMPETENCIA.exec(c);
  if (!m) throw new RangeError(`Competência inválida: ${c}`);
  return { ano: Number(m[1]), mes: Number(m[2]) };
}

export function diasNoMes(c: Competencia): number {
  const { ano, mes } = partesCompetencia(c);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function ehDataValida(valor: unknown): valor is DataISO {
  if (typeof valor !== 'string') return false;
  const m = RE_DATA.exec(valor);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= diasNoMes(competencia(ano, mes));
}

/** Competência padrão de uma despesa: o mês da data. */
export function competenciaDaData(d: DataISO): Competencia {
  const valida: boolean = ehDataValida(d);
  if (!valida) throw new RangeError(`Data inválida: ${d}`);
  return d.slice(0, 7);
}

export function somarMeses(c: Competencia, n: number): Competencia {
  const { ano, mes } = partesCompetencia(c);
  const total = ano * 12 + (mes - 1) + n;
  return competencia(Math.floor(total / 12), (total % 12) + 1);
}

/** Lista as competências de "inicio" até "fim", inclusive. Vazia se fim < inicio. */
export function mesesEntre(inicio: Competencia, fim: Competencia): Competencia[] {
  const lista: Competencia[] = [];
  for (let c = inicio; c <= fim; c = somarMeses(c, 1)) lista.push(c);
  return lista;
}

/** Data no dia indicado do mês. Se o dia não existir (ex.: 31/02), usa o último dia do mês. */
export function dataNoMes(c: Competencia, dia: number): DataISO {
  const ultimo = diasNoMes(c);
  const d = Math.min(Math.max(1, Math.trunc(dia)), ultimo);
  return `${c}-${String(d).padStart(2, '0')}`;
}

export function diaDaData(d: DataISO): number {
  return Number(d.slice(8, 10));
}

/** Data local (do aparelho) no formato AAAA-MM-DD. */
export function dataLocal(instante: Date): DataISO {
  return [
    String(instante.getFullYear()).padStart(4, '0'),
    String(instante.getMonth() + 1).padStart(2, '0'),
    String(instante.getDate()).padStart(2, '0'),
  ].join('-');
}

/** 2026-11-22 → "22/11/2026". */
export function formatarData(d: DataISO): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** 2026-11 → "novembro de 2026". */
export function nomeDaCompetencia(c: Competencia): string {
  const { ano, mes } = partesCompetencia(c);
  return `${MESES[mes - 1] ?? ''} de ${String(ano)}`;
}

/** 2026-11 → "novembro". */
export function nomeDoMes(c: Competencia): string {
  return MESES[partesCompetencia(c).mes - 1] ?? '';
}

/** 2026-11 → "nov/26". */
export function nomeCurtoDaCompetencia(c: Competencia): string {
  const { ano, mes } = partesCompetencia(c);
  return `${(MESES[mes - 1] ?? '').slice(0, 3)}/${String(ano).slice(2)}`;
}
