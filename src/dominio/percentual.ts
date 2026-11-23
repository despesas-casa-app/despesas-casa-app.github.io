import type { PontosBase } from './tipos.ts';

/** 100% em centésimos de ponto. */
export const CEM_POR_CENTO: PontosBase = 10000;
export const METADE: PontosBase = 5000;

export function ehPercentualValido(valor: unknown): valor is PontosBase {
  return Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) <= CEM_POR_CENTO;
}

/** O percentual da outra pessoa. */
export function complemento(p: PontosBase): PontosBase {
  return CEM_POR_CENTO - p;
}

/** 5835 → "58,35%"; 6000 → "60%"; 5830 → "58,3%". */
export function formatarPercentual(p: PontosBase): string {
  if (!ehPercentualValido(p)) throw new RangeError(`Percentual inválido: ${String(p)}`);
  const inteiro = Math.floor(p / 100);
  const decimais = String(p % 100).padStart(2, '0').replace(/0+$/, '');
  return decimais === '' ? `${String(inteiro)}%` : `${String(inteiro)},${decimais}%`;
}

/** "58,35" / "58.35" / "58,35%" / "60" → centésimos de ponto. Até 2 casas. Inválido → null. */
export function lerPercentual(texto: string): PontosBase | null {
  const limpo = texto.trim().replace(/%$/, '').trim().replace(',', '.');
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(limpo);
  if (!m) return null;
  const valor = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return ehPercentualValido(valor) ? valor : null;
}
