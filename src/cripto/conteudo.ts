import { ehEvento, type Evento } from '../dominio/eventos.ts';
import { bytesAleatorios, bytesParaTexto, deBase64, paraBase64, textoParaBytes } from './base64.ts';
import { ErroDeCriptografia, TAMANHO_IV } from './chaves.ts';

/**
 * Cada evento é cifrado com AES-256-GCM, IV aleatório de 96 bits, e dados associados (AAD) com o
 * id do evento e a versão do esquema (especificação 5.2). Assim, trocar o conteúdo de uma linha
 * por outro, ou mudar o id/versão em texto puro, faz a abertura falhar.
 *
 * Em texto puro ficam só: id do evento, versão do esquema e o conteúdo cifrado.
 */
export interface LinhaCifrada {
  readonly id: string;
  readonly versao: number;
  /** Base64 de IV (12 bytes) + texto cifrado com a etiqueta de autenticação. */
  readonly conteudo: string;
}

export function aadDoEvento(id: string, versao: number): Uint8Array<ArrayBuffer> {
  return textoParaBytes(`viver-gasta|evento|v${String(versao)}|${id}`);
}

export async function cifrarTexto(dek: CryptoKey, texto: string, aad: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = bytesAleatorios(TAMANHO_IV);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, dek, textoParaBytes(texto)),
  );
  const tudo = new Uint8Array(iv.length + cifrado.length);
  tudo.set(iv);
  tudo.set(cifrado, iv.length);
  return paraBase64(tudo);
}

export async function decifrarTexto(dek: CryptoKey, conteudo: string, aad: Uint8Array<ArrayBuffer>): Promise<string> {
  try {
    const tudo = deBase64(conteudo);
    if (tudo.length <= TAMANHO_IV) throw new Error('curto');
    const iv = tudo.slice(0, TAMANHO_IV);
    const cifrado = tudo.slice(TAMANHO_IV);
    const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, dek, cifrado);
    return bytesParaTexto(aberto);
  } catch {
    throw new ErroDeCriptografia();
  }
}

export async function cifrarEvento(dek: CryptoKey, evento: Evento): Promise<LinhaCifrada> {
  return {
    id: evento.id,
    versao: evento.versao,
    conteudo: await cifrarTexto(dek, JSON.stringify(evento), aadDoEvento(evento.id, evento.versao)),
  };
}

/** Abre uma linha. Falha se a chave estiver errada, se algo foi adulterado ou se o id não bater. */
export async function decifrarEvento(dek: CryptoKey, linha: LinhaCifrada): Promise<Evento> {
  const texto = await decifrarTexto(dek, linha.conteudo, aadDoEvento(linha.id, linha.versao));
  let evento: unknown;
  try {
    evento = JSON.parse(texto);
  } catch {
    throw new ErroDeCriptografia('Conteúdo inválido.');
  }
  if (!ehEvento(evento) || evento.id !== linha.id || evento.versao !== linha.versao) {
    throw new ErroDeCriptografia('Conteúdo inválido.');
  }
  return evento;
}
