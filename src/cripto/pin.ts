/** Regras do PIN (especificação 5.4): só números, no mínimo 6 dígitos. */
export const PIN_MINIMO = 6;
export const PIN_MAXIMO = 12;
export const TENTATIVAS_MAXIMAS = 10;

/** Devolve o motivo de recusa, ou null se o PIN for aceitável. */
export function validarPin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'Use só números.';
  if (pin.length < PIN_MINIMO) return `Use pelo menos ${String(PIN_MINIMO)} números.`;
  if (pin.length > PIN_MAXIMO) return `Use no máximo ${String(PIN_MAXIMO)} números.`;
  if (/^(\d)\1+$/.test(pin)) return 'Não use o mesmo número repetido.';
  // O PIN já foi validado como só dígitos ASCII, então separar caractere a caractere é seguro.
  const digitos = Array.from({ length: pin.length }, (_, i) => Number(pin.charAt(i)));
  const passos = digitos.slice(1).map((d, i) => d - (digitos[i] ?? 0));
  if (passos.every((p) => p === 1) || passos.every((p) => p === -1)) return 'Não use uma sequência (ex.: 123456).';
  return null;
}
