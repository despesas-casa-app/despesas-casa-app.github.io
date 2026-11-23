import { bytesAleatorios } from './base64.ts';

/**
 * Biometria via passkey (WebAuthn) com a extensão PRF (especificação 5.4).
 *
 * A passkey fica no gerenciador de senhas do aparelho (no Android, o do Google) e é liberada pela
 * digital/rosto. A extensão PRF devolve 32 bytes secretos, sempre os mesmos para o mesmo "sal";
 * deles derivamos a chave que embrulha a DEK. Não há servidor: o desafio é só local.
 *
 * As funções recebem o "navigator.credentials" de fora para poderem ser testadas.
 */

type ResultadoPrf = { enabled?: boolean; results?: { first?: BufferSource } };

export interface Credenciais {
  create(opcoes: CredentialCreationOptions): Promise<Credential | null>;
  get(opcoes: CredentialRequestOptions): Promise<Credential | null>;
}

export interface PasskeyCriada {
  readonly idCredencial: Uint8Array<ArrayBuffer>;
}

export class BiometriaIndisponivel extends Error {
  constructor(mensagem = 'Este aparelho não oferece biometria compatível.') {
    super(mensagem);
    this.name = 'BiometriaIndisponivel';
  }
}

/** O que usamos de uma credencial WebAuthn (só o necessário, sem depender de tipos do navegador). */
interface CredencialChave {
  readonly rawId?: ArrayBuffer;
  getClientExtensionResults?: () => { prf?: ResultadoPrf };
}

function comoChave(credencial: Credential | null): CredencialChave | null {
  return credencial as CredencialChave | null;
}

function resultadoPrf(credencial: Credential | null): ResultadoPrf | undefined {
  return comoChave(credencial)?.getClientExtensionResults?.().prf;
}

function rawId(credencial: Credential | null): Uint8Array<ArrayBuffer> {
  const id = comoChave(credencial)?.rawId;
  if (!id) throw new BiometriaIndisponivel('A biometria não foi concluída.');
  return new Uint8Array(id);
}

/** Copia para um Uint8Array próprio (o navegador pode devolver ArrayBuffer ou uma "visão" dele). */
function paraBytes(b: BufferSource): Uint8Array<ArrayBuffer> {
  const origem = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  const copia = new Uint8Array(origem.length);
  copia.set(origem);
  return copia;
}

/** Se o navegador tem um leitor biométrico embutido (não garante PRF; isso só se sabe ao criar). */
export async function biometriaPossivel(janela: Window = window): Promise<boolean> {
  const pkc = (janela as Window & { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
  if (!pkc || typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
  try {
    return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Cria a passkey deste app no aparelho, exigindo suporte a PRF. */
export async function criarPasskey(credenciais: Credenciais, nomePessoa: string): Promise<PasskeyCriada> {
  let credencial: Credential | null;
  try {
    credencial = await credenciais.create({
      publicKey: {
        rp: { name: 'Viver Gasta' },
        user: { id: bytesAleatorios(16), name: `${nomePessoa} · Viver Gasta`, displayName: nomePessoa },
        challenge: bytesAleatorios(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
        timeout: 120_000,
        extensions: { prf: {} },
      },
    });
  } catch (e) {
    throw new BiometriaIndisponivel(e instanceof Error && e.name === 'NotAllowedError' ? 'A biometria foi cancelada.' : undefined);
  }
  if (!resultadoPrf(credencial)?.enabled) throw new BiometriaIndisponivel();
  return { idCredencial: rawId(credencial) };
}

/** Pede a digital/rosto e devolve os 32 bytes secretos (PRF) para o "sal" dado. */
export async function obterSegredoBiometria(
  credenciais: Credenciais,
  idCredencial: Uint8Array<ArrayBuffer>,
  sal: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  let credencial: Credential | null;
  try {
    credencial = await credenciais.get({
      publicKey: {
        challenge: bytesAleatorios(32),
        allowCredentials: [{ type: 'public-key', id: idCredencial }],
        userVerification: 'required',
        timeout: 120_000,
        extensions: { prf: { eval: { first: sal } } },
      },
    });
  } catch (e) {
    throw new BiometriaIndisponivel(e instanceof Error && e.name === 'NotAllowedError' ? 'A biometria foi cancelada.' : undefined);
  }
  const first = resultadoPrf(credencial)?.results?.first;
  if (!first) throw new BiometriaIndisponivel();
  const bytes = paraBytes(first);
  if (bytes.length < 32) throw new BiometriaIndisponivel();
  return bytes;
}
