import { describe, expect, it } from 'vitest';
import { BiometriaIndisponivel, criarPasskey, obterSegredoBiometria, type Credenciais } from './passkey.ts';

function credencial(extra: object): Credential {
  return { id: 'c', type: 'public-key', ...extra };
}

function falsas(create: () => Promise<Credential | null>, get: () => Promise<Credential | null>): Credenciais {
  return { create, get };
}

const id = new Uint8Array([9, 9]);
const sal = new Uint8Array(32);

describe('passkey (casos de borda)', () => {
  it('criação sem rawId ou com erro inesperado vira "biometria indisponível"', async () => {
    const semId = falsas(() => Promise.resolve(credencial({ getClientExtensionResults: () => ({ prf: { enabled: true } }) })), () => Promise.resolve(null));
    await expect(criarPasskey(semId, 'Ana')).rejects.toThrow('A biometria não foi concluída.');
    const nula = falsas(() => Promise.resolve(null), () => Promise.resolve(null));
    await expect(criarPasskey(nula, 'Ana')).rejects.toBeInstanceOf(BiometriaIndisponivel);
    const quebrada = falsas(() => Promise.reject(new Error('outra coisa')), () => Promise.resolve(null));
    await expect(criarPasskey(quebrada, 'Ana')).rejects.toThrow('Este aparelho não oferece biometria compatível.');
  });

  it('aceita a resposta PRF como ArrayBuffer ou como "visão" de bytes', async () => {
    const bytes = new Uint8Array(40).fill(3);
    const visao = falsas(() => Promise.resolve(null), () =>
      Promise.resolve(credencial({ getClientExtensionResults: () => ({ prf: { results: { first: bytes.subarray(4, 36) } } }) })),
    );
    expect(await obterSegredoBiometria(visao, id, sal)).toEqual(new Uint8Array(32).fill(3));
    const buffer = falsas(() => Promise.resolve(null), () =>
      Promise.resolve(credencial({ getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(32).fill(5).buffer } } }) })),
    );
    expect(await obterSegredoBiometria(buffer, id, sal)).toEqual(new Uint8Array(32).fill(5));
  });

  it('recusa segredo curto, credencial sem extensões e cancelamento', async () => {
    const curto = falsas(() => Promise.resolve(null), () =>
      Promise.resolve(credencial({ getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(8).buffer } } }) })),
    );
    await expect(obterSegredoBiometria(curto, id, sal)).rejects.toBeInstanceOf(BiometriaIndisponivel);
    const semExtensoes = falsas(() => Promise.resolve(null), () => Promise.resolve(credencial({})));
    await expect(obterSegredoBiometria(semExtensoes, id, sal)).rejects.toBeInstanceOf(BiometriaIndisponivel);
    const cancelada = falsas(() => Promise.resolve(null), () => Promise.reject(new DOMException('x', 'NotAllowedError')));
    await expect(obterSegredoBiometria(cancelada, id, sal)).rejects.toThrow('A biometria foi cancelada.');
    const outra = falsas(() => Promise.resolve(null), () => Promise.reject(new Error('rede')));
    await expect(obterSegredoBiometria(outra, id, sal)).rejects.toBeInstanceOf(BiometriaIndisponivel);
  });
});
