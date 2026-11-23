/** Conversões entre bytes e texto Base64 (para guardar dados binários em JSON e na planilha). */

export function paraBase64(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

export function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Bytes aleatórios criptograficamente seguros. */
export function bytesAleatorios(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function textoParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(texto);
}

export function bytesParaTexto(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
