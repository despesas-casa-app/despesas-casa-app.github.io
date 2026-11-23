import { PALAVRAS } from './palavras.ts';

/**
 * Frase-mestra (especificação 5.2): 7 palavras sorteadas de uma lista de 2048 (2^11).
 * Entropia: 7 × 11 = 77 bits.
 *
 * A frase nunca é guardada pelo app: ela só existe na tela no momento de criar e quando a
 * pessoa digita para configurar um aparelho, recuperar ou trocar a frase.
 */
export const PALAVRAS_NA_FRASE = 7;
export const BITS_POR_PALAVRA = 11;
export const ENTROPIA_BITS = PALAVRAS_NA_FRASE * BITS_POR_PALAVRA;

/** Sorteia a frase. Cada palavra usa 11 bits aleatórios (sem viés, pois 2048 = 2^11). */
export function gerarFrase(aleatorio: (n: number) => Uint16Array = (n) => crypto.getRandomValues(new Uint16Array(n))): string[] {
  const numeros = aleatorio(PALAVRAS_NA_FRASE);
  if (numeros.length !== PALAVRAS_NA_FRASE) throw new Error('Fonte de números aleatórios inválida');
  return Array.from(numeros, (n) => {
    const palavra = PALAVRAS[n & 0x7ff];
    if (!palavra) throw new Error('Lista de palavras incompleta');
    return palavra;
  });
}

/** Sem acento, minúsculas, só letras. "Ábaco " → "abaco". */
export function normalizarPalavra(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

const PALAVRAS_SET = new Set(PALAVRAS);

/**
 * Reconhece uma palavra digitada: aceita a palavra inteira ou só o começo, desde que tenha pelo
 * menos 4 letras e identifique uma única palavra da lista.
 */
export function reconhecerPalavra(digitada: string): string | null {
  const p = normalizarPalavra(digitada);
  if (PALAVRAS_SET.has(p)) return p;
  if (p.length < 4) return null;
  const candidatas = PALAVRAS.filter((w) => w.startsWith(p));
  return candidatas.length === 1 ? (candidatas[0] ?? null) : null;
}

/** Sugestões para autocompletar enquanto a pessoa digita. */
export function sugerirPalavras(digitada: string, limite = 4): string[] {
  const p = normalizarPalavra(digitada);
  if (p.length < 2) return [];
  return PALAVRAS.filter((w) => w.startsWith(p)).slice(0, limite);
}

export type ResultadoFrase =
  | { readonly ok: true; readonly palavras: readonly string[] }
  | { readonly ok: false; readonly erro: 'quantidade'; readonly encontradas: number }
  | { readonly ok: false; readonly erro: 'desconhecida'; readonly posicao: number; readonly digitada: string };

/** Valida uma frase digitada (espaços, hífens, maiúsculas e acentos não importam). */
export function validarFrase(texto: string): ResultadoFrase {
  const partes = texto.split(/[\s,.;-]+/).filter((p) => normalizarPalavra(p) !== '');
  if (partes.length !== PALAVRAS_NA_FRASE) return { ok: false, erro: 'quantidade', encontradas: partes.length };
  const palavras: string[] = [];
  for (const [i, parte] of partes.entries()) {
    const p = reconhecerPalavra(parte);
    if (!p) return { ok: false, erro: 'desconhecida', posicao: i + 1, digitada: parte };
    palavras.push(p);
  }
  return { ok: true, palavras };
}

/** Forma canônica usada para derivar a chave: palavras completas separadas por um espaço. */
export function fraseCanonica(palavras: readonly string[]): string {
  return palavras.join(' ');
}
