/**
 * Relógio lógico híbrido (HLC). Dá a cada evento um carimbo que:
 * - acompanha o relógio de parede (dá para saber "quando");
 * - nunca anda para trás, mesmo se o relógio do celular estiver errado;
 * - sempre fica depois de tudo o que o aparelho já viu de outro aparelho;
 * - desempata pelo id do aparelho.
 *
 * O carimbo vira um texto que pode ser comparado em ordem alfabética:
 * "000001795392968042:00000:aparelho".
 */
export interface Hlc {
  readonly ms: number;
  readonly contador: number;
  readonly aparelho: string;
}

const RE_HLC = /^(\d{15}):(\d{5}):([A-Za-z0-9_-]{1,64})$/;
const CONTADOR_MAXIMO = 99999;

export function ehIdAparelhoValido(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export function formatarHlc(h: Hlc): string {
  return `${String(h.ms).padStart(15, '0')}:${String(h.contador).padStart(5, '0')}:${h.aparelho}`;
}

export function lerHlc(texto: string): Hlc {
  const m = RE_HLC.exec(texto);
  if (!m) throw new RangeError(`Carimbo HLC inválido: ${texto}`);
  return { ms: Number(m[1]), contador: Number(m[2]), aparelho: m[3] ?? '' };
}

export function ehHlcValido(texto: unknown): texto is string {
  return typeof texto === 'string' && RE_HLC.test(texto);
}

function verificarContador(contador: number): number {
  if (contador > CONTADOR_MAXIMO) throw new RangeError('Contador do HLC estourou');
  return contador;
}

/** Carimbo para um evento criado neste aparelho. */
export function avancar(ultimo: Hlc | null, agoraMs: number, aparelho: string): Hlc {
  if (!ehIdAparelhoValido(aparelho)) throw new RangeError(`Id de aparelho inválido: ${aparelho}`);
  if (!ultimo || agoraMs > ultimo.ms) return { ms: agoraMs, contador: 0, aparelho };
  return { ms: ultimo.ms, contador: verificarContador(ultimo.contador + 1), aparelho };
}

/** Atualiza o relógio local ao receber um evento de outro aparelho. */
export function receber(local: Hlc | null, remoto: Hlc, agoraMs: number, aparelho: string): Hlc {
  const base = local ?? { ms: 0, contador: 0, aparelho };
  const ms = Math.max(base.ms, remoto.ms, agoraMs);
  let contador = 0;
  if (ms === base.ms && ms === remoto.ms) contador = Math.max(base.contador, remoto.contador) + 1;
  else if (ms === base.ms) contador = base.contador + 1;
  else if (ms === remoto.ms) contador = remoto.contador + 1;
  return { ms, contador: verificarContador(contador), aparelho };
}

/** Instante (ms) de um carimbo em texto. */
export function instanteDoHlc(texto: string): number {
  return lerHlc(texto).ms;
}
