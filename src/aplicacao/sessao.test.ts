import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArmazemEmMemoria } from '../armazenamento/cifrado.ts';
import { LocalEmMemoria } from '../armazenamento/local.ts';
import { gerarFrase } from '../cripto/frase.ts';
import { Cofre } from './cofre.ts';
import { BLOQUEIO_AUTOMATICO_MS, RENOVACAO_MS, Sessao } from './sessao.ts';

function montar() {
  let agora = 1_000_000;
  const armazem = new ArmazemEmMemoria();
  const cofre = new Cofre(armazem, { iteracoes: 1000 });
  const sessao = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), agora: () => agora });
  return { armazem, cofre, sessao, avancar: (ms: number) => (agora += ms) };
}

async function comCofreAberto() {
  const m = montar();
  await m.sessao.iniciar();
  const palavras = gerarFrase();
  const dek = await m.cofre.criar(palavras);
  await m.cofre.configurarPin(dek, '284917');
  await m.sessao.concluirCriacao(dek, { nomeA: 'Ana', nomeB: 'Bruno', euSou: 'B', pctProporcional: 6000 });
  return { ...m, palavras };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sessão', () => {
  it('sem cofre: boas-vindas; demonstração abre com dados fictícios e é lembrada', async () => {
    const { sessao, armazem, cofre } = montar();
    await sessao.iniciar();
    expect(sessao.obter().fase).toBe('boas-vindas');
    await sessao.entrarDemo();
    const e = sessao.obter();
    expect(e.fase === 'aberto' && e.modo).toBe('demo');
    const outra = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria() });
    await outra.iniciar();
    expect(outra.obter().fase).toBe('aberto');
    await outra.sairDemo();
    expect(outra.obter().fase).toBe('boas-vindas');
    // A demonstração não bloqueia.
    await sessao.bloquear();
    expect(sessao.obter().fase).toBe('aberto');
  });

  it('criação do cofre grava nomes, quem usa o aparelho e categorias, tudo cifrado', async () => {
    const { sessao, armazem } = await comCofreAberto();
    const e = sessao.obter();
    if (e.fase !== 'aberto') throw new Error('deveria estar aberto');
    expect(e.modo).toBe('real');
    const foto = e.loja.obterFoto();
    expect(foto.euSou).toBe('B');
    expect(foto.estado.config).toMatchObject({ nomeA: 'Ana', nomeB: 'Bruno' });
    expect(foto.estado.categorias).toHaveLength(13);
    const bruto = JSON.stringify([...armazem.linhas.values()]);
    expect(bruto).not.toContain('Bruno');
    expect(bruto).not.toContain('Moradia');
  });

  it('bloquear descarta tudo; o PIN reabre com os mesmos dados', async () => {
    const { sessao, cofre } = await comCofreAberto();
    await sessao.bloquear();
    expect(sessao.obter()).toEqual({ fase: 'bloqueado', metodo: 'pin' });
    const r = await cofre.abrirComPin('284917');
    if (!r.ok) throw new Error('PIN deveria abrir');
    await sessao.abrir(r.dek);
    const e = sessao.obter();
    expect(e.fase === 'aberto' && e.loja.obterFoto().estado.categorias.length).toBe(13);
  });

  it('reabrir (ou recarregar) em menos de 1 hora não pede a digital', async () => {
    const { armazem, cofre, avancar } = await comCofreAberto();
    let agora = avancar(BLOQUEIO_AUTOMATICO_MS - 60_000);
    const nova = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), agora: () => agora });
    await nova.iniciar();
    const e = nova.obter();
    expect(e.fase === 'aberto' && e.loja.obterFoto().estado.config.nomeB).toBe('Bruno');
    // Reabrir renova o prazo: mais 59 minutos depois ainda abre.
    agora += BLOQUEIO_AUTOMATICO_MS - 60_000;
    const outra = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), agora: () => agora });
    await outra.iniciar();
    expect(outra.obter().fase).toBe('aberto');
  });

  it('depois de 1 hora sem uso, reabrir pede a digital e a sessão guardada é apagada', async () => {
    const { armazem, cofre, avancar } = await comCofreAberto();
    const agora = avancar(BLOQUEIO_AUTOMATICO_MS + 1);
    const nova = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), agora: () => agora });
    await nova.iniciar();
    expect(nova.obter()).toEqual({ fase: 'bloqueado', metodo: 'pin' });
    expect(armazem.sessao).toBeUndefined();
  });

  it('ir para segundo plano renova o prazo de 1 hora', async () => {
    const { armazem, cofre, sessao, avancar } = await comCofreAberto();
    avancar(50 * 60_000);
    sessao.foiParaSegundoPlano();
    await Promise.resolve();
    await Promise.resolve();
    const agora = avancar(100 * 60_000 - 50 * 60_000);
    const nova = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), agora: () => agora });
    await nova.iniciar();
    expect(nova.obter().fase).toBe('aberto');
  });

  it('"Bloquear agora" apaga a sessão: reabrir pede a digital mesmo dentro de 1 hora', async () => {
    const { armazem, cofre, sessao } = await comCofreAberto();
    await sessao.bloquear();
    expect(armazem.sessao).toBeUndefined();
    const nova = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), agora: () => 1_000_000 });
    await nova.iniciar();
    expect(nova.obter().fase).toBe('bloqueado');
  });

  it('a chave temporária da sessão não pode ser copiada', async () => {
    const { armazem } = await comCofreAberto();
    const chave = armazem.sessao?.chave;
    expect(chave?.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', chave!)).rejects.toThrow();
  });

  it('sessão guardada adulterada é descartada', async () => {
    const { armazem, cofre } = await comCofreAberto();
    const s = armazem.sessao!;
    armazem.sessao = { ...s, dek: { ...s.dek, dados: s.dek.iv } };
    expect(await cofre.abrirSessaoGuardada(1_000_000)).toBeNull();
    expect(armazem.sessao).toBeUndefined();
  });

  it('10 PINs errados também apagam a sessão guardada', async () => {
    const { armazem, cofre } = await comCofreAberto();
    for (let i = 0; i < 10; i++) await cofre.abrirComPin('000001');
    expect(armazem.sessao).toBeUndefined();
    await cofre.renovarSessao(9_999_999);
    expect(armazem.meta.has('sessaoExpiraEm')).toBe(false);
  });

  it('enquanto o app está na tela, o prazo é renovado de tempos em tempos', async () => {
    vi.useFakeTimers();
    const { sessao, armazem, avancar } = await comCofreAberto();
    const doc = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Document;
    const antes = armazem.meta.get('sessaoExpiraEm');
    const parar = sessao.vigiar(doc);
    const agora = avancar(RENOVACAO_MS);
    await vi.advanceTimersByTimeAsync(RENOVACAO_MS + 10);
    expect(armazem.meta.get('sessaoExpiraEm')).not.toBe(antes);
    expect(armazem.meta.get('sessaoExpiraEm')).toBe(String(agora + BLOQUEIO_AUTOMATICO_MS));
    parar();
  });

  it('bloqueia sozinho depois de 5 minutos em segundo plano', async () => {
    vi.useFakeTimers();
    const { sessao } = await comCofreAberto();
    sessao.foiParaSegundoPlano();
    await vi.advanceTimersByTimeAsync(BLOQUEIO_AUTOMATICO_MS - 1000);
    expect(sessao.obter().fase).toBe('aberto');
    await vi.advanceTimersByTimeAsync(2000);
    expect(sessao.obter().fase).toBe('bloqueado');
  });

  it('se o temporizador não rodou (celular dormindo), bloqueia ao voltar', async () => {
    vi.useFakeTimers();
    const { sessao, avancar } = await comCofreAberto();
    sessao.foiParaSegundoPlano();
    avancar(BLOQUEIO_AUTOMATICO_MS + 1);
    sessao.voltouParaFrente();
    await vi.runAllTimersAsync();
    expect(sessao.obter().fase).toBe('bloqueado');
  });

  it('voltar antes de 5 minutos não bloqueia', async () => {
    vi.useFakeTimers();
    const { sessao, avancar } = await comCofreAberto();
    sessao.foiParaSegundoPlano();
    avancar(60_000);
    sessao.voltouParaFrente();
    await vi.advanceTimersByTimeAsync(BLOQUEIO_AUTOMATICO_MS * 2);
    expect(sessao.obter().fase).toBe('aberto');
    sessao.voltouParaFrente(); // chamado sem ter saído: nada acontece
    expect(sessao.obter().fase).toBe('aberto');
  });

  it('vigia a visibilidade da página', async () => {
    const { sessao } = await comCofreAberto();
    let visibilidade: DocumentVisibilityState = 'visible';
    const ouvintes: (() => void)[] = [];
    const doc = {
      get visibilityState() {
        return visibilidade;
      },
      addEventListener: (_: string, f: () => void) => ouvintes.push(f),
      removeEventListener: vi.fn(),
    } as unknown as Document;
    const parar = sessao.vigiar(doc);
    const segundo = vi.spyOn(sessao, 'foiParaSegundoPlano');
    const frente = vi.spyOn(sessao, 'voltouParaFrente');
    visibilidade = 'hidden';
    ouvintes.forEach((f) => { f(); });
    visibilidade = 'visible';
    ouvintes.forEach((f) => { f(); });
    expect(segundo).toHaveBeenCalledOnce();
    expect(frente).toHaveBeenCalledOnce();
    parar();
  });

  it('apagar os dados do aparelho volta às boas-vindas', async () => {
    const { sessao, cofre } = await comCofreAberto();
    let avisos = 0;
    const cancelar = sessao.assinar(() => (avisos += 1));
    await sessao.apagarDadosDoAparelho();
    expect(sessao.obter().fase).toBe('boas-vindas');
    expect(await cofre.existe()).toBe(false);
    expect(avisos).toBe(1);
    cancelar();
  });

  it('nomes inválidos na criação dão erro claro', async () => {
    const { sessao, cofre } = montar();
    const dek = await cofre.criar(gerarFrase());
    await expect(sessao.concluirCriacao(dek, { nomeA: 'Ana', nomeB: 'ana', euSou: 'A', pctProporcional: 5000 })).rejects.toThrow(
      'Os nomes precisam ser diferentes.',
    );
  });
});
