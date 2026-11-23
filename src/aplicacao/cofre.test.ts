import { describe, expect, it } from 'vitest';
import { ArmazemEmMemoria, RepositorioCifrado } from '../armazenamento/cifrado.ts';
import { gerarDek } from '../cripto/chaves.ts';
import { gerarFrase } from '../cripto/frase.ts';
import { BiometriaIndisponivel, biometriaPossivel, type Credenciais } from '../cripto/passkey.ts';
import type { Evento } from '../dominio/eventos.ts';
import { Cofre } from './cofre.ts';

const RAPIDO = { iteracoes: 1000 };

/** Leitor de digital de mentira: devolve sempre os mesmos 32 bytes para o mesmo "sal". */
function biometriaFalsa(op: { prf?: boolean; cancelar?: boolean; semResultado?: boolean } = {}): Credenciais & { chamadas: number } {
  const segredoDoAparelho = new Uint8Array(32).fill(7);
  const falsa = {
    chamadas: 0,
    create(): Promise<Credential | null> {
      if (op.cancelar) return Promise.reject(new DOMException('cancelado', 'NotAllowedError'));
      return Promise.resolve({
        id: 'cred',
        type: 'public-key',
        rawId: new Uint8Array([1, 2, 3]).buffer,
        getClientExtensionResults: () => ({ prf: { enabled: op.prf ?? true } }),
      } as unknown as Credential);
    },
    async get(opcoes: CredentialRequestOptions): Promise<Credential | null> {
      falsa.chamadas += 1;
      const prf = (opcoes.publicKey?.extensions as { prf?: { eval?: { first?: Uint8Array } } } | undefined)?.prf;
      const sal = prf?.eval?.first ?? new Uint8Array();
      const juntos = new Uint8Array([...segredoDoAparelho, ...sal]);
      const first = op.semResultado ? undefined : await crypto.subtle.digest('SHA-256', juntos);
      return {
        id: 'cred',
        type: 'public-key',
        rawId: new Uint8Array([1, 2, 3]).buffer,
        getClientExtensionResults: () => ({ prf: { results: first ? { first } : {} } }),
      } as unknown as Credential;
    },
  };
  return falsa;
}

async function cofreCriado(opcoes = {}) {
  const armazem = new ArmazemEmMemoria();
  const cofre = new Cofre(armazem, { ...RAPIDO, ...opcoes });
  const palavras = gerarFrase();
  const dek = await cofre.criar(palavras);
  return { armazem, cofre, palavras, dek };
}

describe('cofre: frase-mestra', () => {
  it('cria o cofre sem guardar a frase', async () => {
    const { armazem, cofre, palavras } = await cofreCriado();
    expect(await cofre.existe()).toBe(true);
    const tudo = JSON.stringify([...armazem.meta.values()]);
    for (const p of palavras) expect(tudo).not.toContain(p);
    expect(await cofre.meta()).toMatchObject({ versao: 1, kdf: 'PBKDF2-SHA256', iteracoes: 1000 });
  });

  it('a frase certa abre; a errada ou inválida não', async () => {
    const { cofre, palavras } = await cofreCriado();
    expect((await cofre.abrirComFrase(palavras.join(' '))).ok).toBe(true);
    expect((await cofre.abrirComFrase(palavras.map((p) => p.slice(0, 4).toUpperCase()).join('  '))).ok).toBe(true);
    const outra = gerarFrase();
    expect(await cofre.abrirComFrase(outra.join(' '))).toEqual({ ok: false, motivo: 'nao-confere' });
    expect(await cofre.abrirComFrase('uma duas')).toMatchObject({ ok: false, motivo: 'invalida', mensagem: expect.stringContaining('7 palavras') as string });
    expect(await cofre.abrirComFrase(`${palavras.slice(0, 6).join(' ')} qwerty`)).toMatchObject({
      ok: false,
      motivo: 'invalida',
      mensagem: expect.stringContaining('palavra 7') as string,
    });
  });

  it('trocar a frase exige a atual e mantém a mesma DEK (dados continuam abrindo)', async () => {
    const { armazem, cofre, palavras, dek } = await cofreCriado();
    const repo = new RepositorioCifrado(armazem, dek);
    const evento: Evento = {
      id: 'e1', versao: 1, hlc: '000000000000001:00000:x', autor: 'A', tipo: 'criar',
      entidade: 'despesa', entidadeId: 'd1', campos: { descricao: 'Fictícia' },
    };
    await repo.salvarEventos([evento]);
    const nova = gerarFrase();
    expect(await cofre.trocarFrase(gerarFrase().join(' '), nova)).toEqual({ ok: false, motivo: 'nao-confere' });
    const r = await cofre.trocarFrase(palavras.join(' '), nova);
    expect(r.ok).toBe(true);
    expect((await cofre.abrirComFrase(palavras.join(' '))).ok).toBe(false);
    const aberta = await cofre.abrirComFrase(nova.join(' '));
    if (!aberta.ok) throw new Error('deveria abrir');
    expect(await new RepositorioCifrado(armazem, aberta.dek).carregarEventos()).toEqual([evento]);
  });

  it('sem cofre, nada abre; dados corrompidos no banco são ignorados', async () => {
    const armazem = new ArmazemEmMemoria();
    const cofre = new Cofre(armazem, RAPIDO);
    expect(await cofre.existe()).toBe(false);
    expect(await cofre.abrirComFrase(gerarFrase().join(' '))).toEqual({ ok: false, motivo: 'nao-confere' });
    armazem.meta.set('cofre', '{quebrado');
    armazem.meta.set('desbloqueio', JSON.stringify({ metodo: 'outro', dek: { iv: 'a', dados: 'b' } }));
    expect(await cofre.meta()).toBeNull();
    expect(await cofre.metodo()).toBeNull();
    armazem.meta.set('desbloqueio', JSON.stringify({ metodo: 'pin', dek: {} }));
    expect(await cofre.metodo()).toBeNull();
    armazem.meta.set('desbloqueio', 'null');
    expect(await cofre.metodo()).toBeNull();
  });
});

describe('cofre: PIN', () => {
  it('abre com o PIN certo e recusa PIN fraco', async () => {
    const { cofre, dek } = await cofreCriado();
    await expect(cofre.configurarPin(dek, '123456')).rejects.toThrow(/sequência/);
    await cofre.configurarPin(dek, '284917');
    expect(await cofre.metodo()).toBe('pin');
    expect((await cofre.abrirComPin('284917')).ok).toBe(true);
    await expect(cofre.abrirComBiometria()).rejects.toThrow(/não configurada/);
  });

  it('conta as tentativas e, no 10º erro, apaga a DEK local e passa a exigir a frase', async () => {
    const { cofre, dek, palavras } = await cofreCriado();
    await cofre.configurarPin(dek, '284917');
    for (let i = 1; i <= 9; i++) {
      expect(await cofre.abrirComPin('000001')).toEqual({ ok: false, motivo: 'pin-errado', restantes: 10 - i });
    }
    expect(await cofre.abrirComPin('000001')).toEqual({ ok: false, motivo: 'bloqueado' });
    expect(await cofre.metodo()).toBeNull();
    // Nem o PIN certo abre mais.
    expect(await cofre.abrirComPin('284917')).toEqual({ ok: false, motivo: 'bloqueado' });
    // A frase continua funcionando, e dá para criar um PIN novo.
    const r = await cofre.abrirComFrase(palavras.join(' '));
    if (!r.ok) throw new Error('deveria abrir');
    await cofre.configurarPin(r.dek, '739154');
    expect(await cofre.tentativasRestantes()).toBe(10);
  });

  it('acertar o PIN zera o contador', async () => {
    const { cofre, dek } = await cofreCriado();
    await cofre.configurarPin(dek, '284917');
    await cofre.abrirComPin('999990');
    await cofre.abrirComPin('999990');
    expect(await cofre.tentativasRestantes()).toBe(8);
    await cofre.abrirComPin('284917');
    expect(await cofre.tentativasRestantes()).toBe(10);
  });
});

describe('cofre: biometria (passkey com PRF)', () => {
  it('configura e abre com a digital', async () => {
    const leitor = biometriaFalsa();
    const { cofre, dek } = await cofreCriado({ credenciais: leitor });
    await cofre.configurarBiometria(dek, 'Ana');
    expect(await cofre.metodo()).toBe('biometria');
    const aberta = await cofre.abrirComBiometria();
    const repoA = new RepositorioCifrado(new ArmazemEmMemoria(), dek);
    const linha: Evento = {
      id: 'e1', versao: 1, hlc: '000000000000001:00000:x', autor: 'A', tipo: 'criar',
      entidade: 'despesa', entidadeId: 'd1', campos: {},
    };
    await repoA.salvarEventos([linha]);
    expect(aberta.algorithm).toMatchObject({ name: 'AES-GCM' });
    expect(leitor.chamadas).toBe(2);
    // PIN errado não se aplica à biometria.
    expect(await cofre.abrirComPin('284917')).toEqual({ ok: false, motivo: 'bloqueado' });
  });

  it('aparelho sem PRF, cancelamento e resposta incompleta viram "biometria indisponível"', async () => {
    const dek = await gerarDek();
    const semPrf = new Cofre(new ArmazemEmMemoria(), { ...RAPIDO, credenciais: biometriaFalsa({ prf: false }) });
    await expect(semPrf.configurarBiometria(dek, 'Ana')).rejects.toBeInstanceOf(BiometriaIndisponivel);
    const cancelada = new Cofre(new ArmazemEmMemoria(), { ...RAPIDO, credenciais: biometriaFalsa({ cancelar: true }) });
    await expect(cancelada.configurarBiometria(dek, 'Ana')).rejects.toThrow('A biometria foi cancelada.');
    const incompleta = new Cofre(new ArmazemEmMemoria(), { ...RAPIDO, credenciais: biometriaFalsa({ semResultado: true }) });
    await expect(incompleta.configurarBiometria(dek, 'Ana')).rejects.toBeInstanceOf(BiometriaIndisponivel);
  });

  it('detecta se o navegador tem leitor biométrico', async () => {
    expect(await biometriaPossivel({} as Window)).toBe(false);
    const com = { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true) } };
    expect(await biometriaPossivel(com as unknown as Window)).toBe(true);
    const falha = { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.reject(new Error('x')) } };
    expect(await biometriaPossivel(falha as unknown as Window)).toBe(false);
  });
});

describe('banco local criptografado', () => {
  it('guarda só dados cifrados; com outra chave nada abre', async () => {
    const armazem = new ArmazemEmMemoria();
    const dek = await gerarDek();
    const repo = new RepositorioCifrado(armazem, dek);
    const evento: Evento = {
      id: 'e1', versao: 1, hlc: '000000000000001:00000:x', autor: 'B', tipo: 'criar',
      entidade: 'despesa', entidadeId: 'd1', campos: { descricao: 'Padaria Fictícia', valor: 990 },
    };
    await repo.salvarEventos([evento]);
    await repo.salvarEventos([]);
    const bruto = JSON.stringify([...armazem.linhas.values()]);
    expect(bruto).not.toContain('Padaria');
    expect(bruto).not.toContain('990');
    expect(await repo.carregarEventos()).toEqual([evento]);
    const outra = new RepositorioCifrado(armazem, await gerarDek());
    expect(await outra.carregarEventos()).toEqual([]);
    expect(outra.ilegiveis).toBe(1);
    await repo.gravarMeta('x', 'y');
    expect(await repo.lerMeta('x')).toBe('y');
    await repo.apagarTudo();
    expect(armazem.linhas.size).toBe(0);
  });
});
