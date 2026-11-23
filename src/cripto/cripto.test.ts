import { describe, expect, it } from 'vitest';
import type { Evento } from '../dominio/eventos.ts';
import { bytesAleatorios, bytesParaTexto, deBase64, paraBase64, textoParaBytes } from './base64.ts';
import {
  derivarChaveDeBiometria,
  derivarChaveDeSegredo,
  desembrulharDek,
  embrulharDek,
  ErroDeCriptografia,
  gerarDek,
  ITERACOES_PBKDF2,
  novoSalt,
} from './chaves.ts';
import { aadDoEvento, cifrarEvento, cifrarTexto, decifrarEvento, decifrarTexto } from './conteudo.ts';
import {
  ENTROPIA_BITS,
  fraseCanonica,
  gerarFrase,
  normalizarPalavra,
  reconhecerPalavra,
  sugerirPalavras,
  validarFrase,
} from './frase.ts';
import { PALAVRAS } from './palavras.ts';
import { validarPin } from './pin.ts';

const POUCAS = 1000; // iterações baixas só para os testes ficarem rápidos

const evento: Evento = {
  id: 'ev-1',
  versao: 1,
  hlc: '000001795392968042:00000:cel1'.slice(3),
  autor: 'A',
  tipo: 'criar',
  entidade: 'despesa',
  entidadeId: 'd1',
  campos: { valor: 12345, descricao: 'Fictícia com acentuação: pão' },
};

/** Troca um byte do meio de um texto Base64 (simula adulteração). */
function adulterar(b64: string): string {
  const bytes = deBase64(b64);
  const i = Math.floor(bytes.length / 2);
  bytes[i] = (bytes[i] ?? 0) ^ 0x01;
  return paraBase64(bytes);
}

describe('base64', () => {
  it('ida e volta', () => {
    const b = bytesAleatorios(40);
    expect(deBase64(paraBase64(b))).toEqual(b);
    expect(bytesParaTexto(textoParaBytes('ação ✓'))).toBe('ação ✓');
  });
});

describe('frase-mestra', () => {
  it('a lista tem 2048 palavras únicas, sem acento, identificáveis pelas 4 primeiras letras', () => {
    expect(PALAVRAS).toHaveLength(2048);
    expect(new Set(PALAVRAS).size).toBe(2048);
    expect(PALAVRAS.every((p) => /^[a-z]{4,8}$/.test(p))).toBe(true);
    expect(new Set(PALAVRAS.map((p) => p.slice(0, 4))).size).toBe(2048);
    expect(ENTROPIA_BITS).toBeGreaterThanOrEqual(77);
  });

  it('gera 7 palavras da lista, usando 11 bits por palavra', () => {
    const frase = gerarFrase();
    expect(frase).toHaveLength(7);
    expect(frase.every((p) => PALAVRAS.includes(p))).toBe(true);
    const fixa = gerarFrase(() => Uint16Array.from([0, 2047, 2048, 65535, 1, 2, 3]));
    expect(fixa).toEqual([PALAVRAS[0], PALAVRAS[2047], PALAVRAS[0], PALAVRAS[2047], PALAVRAS[1], PALAVRAS[2], PALAVRAS[3]]);
    expect(() => gerarFrase(() => Uint16Array.from([0]))).toThrow();
  });

  it('frases sorteadas não se repetem', () => {
    const vistas = new Set(Array.from({ length: 200 }, () => fraseCanonica(gerarFrase())));
    expect(vistas.size).toBe(200);
  });

  it('reconhece palavra inteira, começo único com 4+ letras, acentos e maiúsculas', () => {
    expect(normalizarPalavra(' Ábaco! ')).toBe('abaco');
    expect(reconhecerPalavra('ABACATE')).toBe('abacate');
    expect(reconhecerPalavra('abac')).toBe('abacate');
    expect(reconhecerPalavra('aba')).toBeNull();
    expect(reconhecerPalavra('xyzw')).toBeNull();
    expect(sugerirPalavras('abal')).toEqual(['abalar']);
    expect(sugerirPalavras('a')).toEqual([]);
  });

  it('valida a frase digitada', () => {
    const palavras = gerarFrase();
    const digitada = palavras.map((p, i) => (i % 2 ? p.toUpperCase() : p.slice(0, 4))).join(' - ');
    expect(validarFrase(digitada)).toEqual({ ok: true, palavras });
    expect(validarFrase('abacate abaixo')).toEqual({ ok: false, erro: 'quantidade', encontradas: 2 });
    expect(validarFrase(`${palavras.slice(0, 6).join(' ')} zzzzzz`)).toEqual({
      ok: false,
      erro: 'desconhecida',
      posicao: 7,
      digitada: 'zzzzzz',
    });
  });
});

describe('chaves (KEK/DEK)', () => {
  it('ida e volta: a frase certa abre a DEK', async () => {
    const salt = deBase64(novoSalt());
    const dek = await gerarDek();
    const kek = await derivarChaveDeSegredo('abacate abaixo abalar abater abduzir abelha aberto', salt, POUCAS);
    const embrulho = await embrulharDek(dek, kek, 'frase');
    const kek2 = await derivarChaveDeSegredo('abacate abaixo abalar abater abduzir abelha aberto', salt, POUCAS);
    const aberta = await desembrulharDek(embrulho, kek2, 'frase');
    const linha = await cifrarEvento(dek, evento);
    expect(await decifrarEvento(aberta, linha)).toEqual(evento);
  });

  it('frase errada, salt errado ou uso errado falham', async () => {
    const salt = deBase64(novoSalt());
    const dek = await gerarDek();
    const kek = await derivarChaveDeSegredo('frase certa', salt, POUCAS);
    const embrulho = await embrulharDek(dek, kek, 'frase');
    const errada = await derivarChaveDeSegredo('frase errada', salt, POUCAS);
    await expect(desembrulharDek(embrulho, errada, 'frase')).rejects.toBeInstanceOf(ErroDeCriptografia);
    const outroSalt = await derivarChaveDeSegredo('frase certa', deBase64(novoSalt()), POUCAS);
    await expect(desembrulharDek(embrulho, outroSalt, 'frase')).rejects.toBeInstanceOf(ErroDeCriptografia);
    await expect(desembrulharDek(embrulho, kek, 'pin')).rejects.toBeInstanceOf(ErroDeCriptografia);
    await expect(desembrulharDek({ ...embrulho, dados: adulterar(embrulho.dados) }, kek, 'frase')).rejects.toBeInstanceOf(
      ErroDeCriptografia,
    );
  });

  it('a mesma DEK pode ser embrulhada pela biometria e pelo PIN', async () => {
    const dek = await gerarDek();
    const prf = bytesAleatorios(32);
    const sal = bytesAleatorios(16);
    const chaveBio = await derivarChaveDeBiometria(prf, sal);
    const viaBio = await desembrulharDek(await embrulharDek(dek, chaveBio, 'biometria'), await derivarChaveDeBiometria(prf, sal), 'biometria');
    const linha = await cifrarEvento(dek, evento);
    expect(await decifrarEvento(viaBio, linha)).toEqual(evento);
    const outraDigital = await derivarChaveDeBiometria(bytesAleatorios(32), sal);
    await expect(desembrulharDek(await embrulharDek(dek, chaveBio, 'biometria'), outraDigital, 'biometria')).rejects.toBeInstanceOf(
      ErroDeCriptografia,
    );
  });

  it('usa pelo menos 600.000 iterações por padrão', async () => {
    expect(ITERACOES_PBKDF2).toBeGreaterThanOrEqual(600_000);
    const salt = deBase64(novoSalt());
    const k1 = await derivarChaveDeSegredo('frase', salt);
    const dek = await gerarDek();
    const emb = await embrulharDek(dek, k1, 'frase');
    await expect(desembrulharDek(emb, await derivarChaveDeSegredo('frase', salt, POUCAS), 'frase')).rejects.toBeInstanceOf(
      ErroDeCriptografia,
    );
  });
});

describe('conteúdo dos eventos (AES-256-GCM)', () => {
  it('ida e volta', async () => {
    const dek = await gerarDek();
    const linha = await cifrarEvento(dek, evento);
    expect(linha.id).toBe('ev-1');
    expect(linha.versao).toBe(1);
    expect(linha.conteudo).not.toContain('Fictícia');
    expect(await decifrarEvento(dek, linha)).toEqual(evento);
  });

  it('o mesmo evento cifrado duas vezes dá resultados diferentes (IV aleatório)', async () => {
    const dek = await gerarDek();
    expect((await cifrarEvento(dek, evento)).conteudo).not.toBe((await cifrarEvento(dek, evento)).conteudo);
  });

  it('chave errada falha', async () => {
    const linha = await cifrarEvento(await gerarDek(), evento);
    await expect(decifrarEvento(await gerarDek(), linha)).rejects.toBeInstanceOf(ErroDeCriptografia);
  });

  it('adulterar o texto cifrado falha', async () => {
    const dek = await gerarDek();
    const linha = await cifrarEvento(dek, evento);
    await expect(decifrarEvento(dek, { ...linha, conteudo: adulterar(linha.conteudo) })).rejects.toBeInstanceOf(ErroDeCriptografia);
    await expect(decifrarEvento(dek, { ...linha, conteudo: 'AAAA' })).rejects.toBeInstanceOf(ErroDeCriptografia);
    await expect(decifrarEvento(dek, { ...linha, conteudo: '###' })).rejects.toBeInstanceOf(ErroDeCriptografia);
  });

  it('adulterar a AAD (id ou versão em texto puro) falha', async () => {
    const dek = await gerarDek();
    const linha = await cifrarEvento(dek, evento);
    await expect(decifrarEvento(dek, { ...linha, id: 'ev-2' })).rejects.toBeInstanceOf(ErroDeCriptografia);
    await expect(decifrarEvento(dek, { ...linha, versao: 2 })).rejects.toBeInstanceOf(ErroDeCriptografia);
  });

  it('trocar o conteúdo entre duas linhas falha', async () => {
    const dek = await gerarDek();
    const a = await cifrarEvento(dek, evento);
    const b = await cifrarEvento(dek, { ...evento, id: 'ev-2' });
    await expect(decifrarEvento(dek, { ...a, conteudo: b.conteudo })).rejects.toBeInstanceOf(ErroDeCriptografia);
  });

  it('recusa conteúdo que abre mas não é um evento válido', async () => {
    const dek = await gerarDek();
    const aad = aadDoEvento('x', 1);
    expect(await decifrarTexto(dek, await cifrarTexto(dek, 'olá', aad), aad)).toBe('olá');
    await expect(decifrarEvento(dek, { id: 'x', versao: 1, conteudo: await cifrarTexto(dek, 'não é json', aad) })).rejects.toThrow(
      'Conteúdo inválido.',
    );
    await expect(
      decifrarEvento(dek, { id: 'x', versao: 1, conteudo: await cifrarTexto(dek, JSON.stringify({ ...evento, id: 'outro' }), aad) }),
    ).rejects.toThrow('Conteúdo inválido.');
  });
});

describe('PIN', () => {
  it('exige 6+ números e recusa os óbvios', () => {
    expect(validarPin('284917')).toBeNull();
    expect(validarPin('28491')).toMatch(/pelo menos 6/);
    expect(validarPin('2849a7')).toMatch(/só números/);
    expect(validarPin('1234567890123')).toMatch(/no máximo/);
    expect(validarPin('111111')).toMatch(/repetido/);
    expect(validarPin('123456')).toMatch(/sequência/);
    expect(validarPin('987654')).toMatch(/sequência/);
  });
});
