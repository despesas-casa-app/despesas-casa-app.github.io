import { bytesAleatorios, deBase64, paraBase64, textoParaBytes } from './base64.ts';

/**
 * Hierarquia de chaves (especificação 5.2), só com a WebCrypto nativa:
 *
 *   frase-mestra ──PBKDF2-SHA256 (≥ 600.000 iterações, salt aleatório)──▶ KEK
 *   DEK (AES-256-GCM, aleatória) ──embrulhada pela KEK──▶ "DEK embrulhada" (vai na aba meta)
 *
 * No aparelho, a mesma DEK também é embrulhada por uma chave da biometria (PRF da passkey) ou do
 * PIN. Trocar a frase só re-embrulha a DEK; os dados não precisam ser recriptografados.
 */

export const ITERACOES_PBKDF2 = 600_000;
export const TAMANHO_SALT = 16;
const TAMANHO_IV = 12; // 96 bits

export class ErroDeCriptografia extends Error {
  constructor(mensagem = 'Não foi possível abrir os dados: chave errada ou dados adulterados.') {
    super(mensagem);
    this.name = 'ErroDeCriptografia';
  }
}

/** DEK embrulhada (cifrada) por outra chave, pronta para guardar em JSON. */
export interface Embrulho {
  readonly iv: string;
  readonly dados: string;
}

/** Contexto que amarra cada embrulho ao seu uso (dados associados, AAD). */
export type UsoEmbrulho = 'frase' | 'pin' | 'biometria' | 'sessao';

function aadDoEmbrulho(uso: UsoEmbrulho): Uint8Array<ArrayBuffer> {
  return textoParaBytes(`viver-gasta|dek|v1|${uso}`);
}

/** Chave que embrulha a DEK, derivada de um segredo digitado (frase ou PIN). */
export async function derivarChaveDeSegredo(
  segredo: string,
  salt: Uint8Array<ArrayBuffer>,
  iteracoes: number = ITERACOES_PBKDF2,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', textoParaBytes(segredo.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteracoes },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Chave que embrulha a DEK, derivada do segredo da biometria (saída PRF da passkey, 32 bytes). */
export async function derivarChaveDeBiometria(
  prf: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: textoParaBytes('viver-gasta|biometria|v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/**
 * Gera a DEK. Ela é "exportável" só para poder ser embrulhada de novo (novo PIN, nova frase);
 * nunca é gravada aberta em lugar nenhum.
 */
export function gerarDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function embrulharDek(dek: CryptoKey, chave: CryptoKey, uso: UsoEmbrulho): Promise<Embrulho> {
  const iv = bytesAleatorios(TAMANHO_IV);
  const dados = await crypto.subtle.wrapKey('raw', dek, chave, { name: 'AES-GCM', iv, additionalData: aadDoEmbrulho(uso) });
  return { iv: paraBase64(iv), dados: paraBase64(new Uint8Array(dados)) };
}

export async function desembrulharDek(embrulho: Embrulho, chave: CryptoKey, uso: UsoEmbrulho): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      deBase64(embrulho.dados),
      chave,
      { name: 'AES-GCM', iv: deBase64(embrulho.iv), additionalData: aadDoEmbrulho(uso) },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new ErroDeCriptografia();
  }
}

/**
 * Chave temporária da sessão: gerada a cada desbloqueio e NÃO exportável — o navegador guarda o
 * material, mas nenhum código (nem o próprio app) consegue copiá-la.
 */
export function gerarChaveDeSessao(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

/** Salt novo, em Base64. */
export function novoSalt(): string {
  return paraBase64(bytesAleatorios(TAMANHO_SALT));
}

export { TAMANHO_IV };
