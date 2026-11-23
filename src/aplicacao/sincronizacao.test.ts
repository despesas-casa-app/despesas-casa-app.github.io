// Dois celulares de mentira conversando por uma "planilha" em memória. Dados fictícios.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArmazemEmMemoria, RepositorioCifrado } from '../armazenamento/cifrado.ts';
import {
  ErroDeRede,
  ErroSemAcesso,
  ErroSemAutorizacao,
  ErroTemporario,
  RemotoEmMemoria,
  type LeituraRemota,
  type LinhaRemota,
  type RepositorioRemoto,
} from '../armazenamento/remoto.ts';
import { gerarDek } from '../cripto/chaves.ts';
import { criarCategoriasIniciais } from '../dominio/categorias.ts';
import { definirNomes } from '../dominio/config.ts';
import { alterarDespesa, criarDespesa } from '../dominio/despesas.ts';
import { criarRecorrente, gerarRecorrentesPendentes } from '../dominio/recorrentes.ts';
import { Loja } from './loja.ts';
import { ESPERA_APOS_LANCAMENTO_MS, ESPERA_MINIMA_MS, INTERVALO_MS, Sincronizador } from './sincronizacao.ts';

afterEach(() => {
  vi.useRealTimers();
});

/** Planilha de mentira que pode falhar de propósito. */
class PlanilhaInstavel implements RepositorioRemoto {
  readonly base = new RemotoEmMemoria();
  falharAnexar: Error | null = null;
  falharLer: Error | null = null;
  /** Grava, mas "perde a resposta" (simula queda de conexão depois do envio). */
  perderResposta = false;

  async anexar(linhas: readonly LinhaRemota[]): Promise<void> {
    if (this.falharAnexar) throw this.falharAnexar;
    await this.base.anexar(linhas);
    if (this.perderResposta) {
      this.perderResposta = false;
      throw new ErroDeRede();
    }
  }

  lerAPartirDe(posicao: number): Promise<LeituraRemota> {
    if (this.falharLer) return Promise.reject(this.falharLer);
    return this.base.lerAPartirDe(posicao);
  }
}

interface Celular {
  loja: Loja;
  sync: Sincronizador;
  armazem: ArmazemEmMemoria;
  online: boolean;
  agora: Date;
}

async function celular(remoto: RepositorioRemoto, dek: CryptoKey, hoje = '2026-11-10'): Promise<Celular> {
  const armazem = new ArmazemEmMemoria();
  const c = { armazem, online: true, agora: new Date(`${hoje}T12:00:00`) } as Celular;
  c.loja = new Loja(new RepositorioCifrado(armazem, dek), () => c.agora);
  await c.loja.iniciar();
  c.sync = new Sincronizador({ loja: c.loja, remoto, meta: armazem, dek, online: () => c.online });
  return c;
}

function idCategoria(c: Celular, nome: string): string {
  return c.loja.obterFoto().estado.categorias.find((x) => x.nome === nome)?.id ?? '';
}

function lancar(c: Celular, valor: number, descricao: string, data = '2026-11-08'): string {
  const r = c.loja.executar((e, ctx) =>
    criarDespesa(e, {
      valor, descricao, data, competencia: data.slice(0, 7), categoriaId: idCategoria(c, 'Outros'),
      pagador: c.loja.obterFoto().euSou, pctA: 5000, pctPadrao: true,
    }, ctx),
  );
  if (!r.ok) throw new Error('não lançou');
  return r.eventos[0]?.entidadeId ?? '';
}

async function casalSincronizado() {
  const remoto = new PlanilhaInstavel();
  const dek = await gerarDek();
  const ana = await celular(remoto, dek);
  ana.loja.executar((e, ctx) => definirNomes(e, 'Ana', 'Bruno', ctx));
  ana.loja.executar((_, ctx) => criarCategoriasIniciais(6000, ctx));
  await ana.sync.sincronizar();
  const bruno = await celular(remoto, dek);
  await bruno.loja.definirEuSou('B');
  await bruno.sync.sincronizar();
  return { remoto, dek, ana, bruno };
}

const despesas = (c: Celular) =>
  c.loja.obterFoto().estado.despesas.map((d) => [d.id, d.descricao, d.valor, d.excluida]).sort();

describe('sincronização entre dois celulares', () => {
  it('a 2ª pessoa recebe tudo o que a 1ª criou; na planilha só vai texto cifrado', async () => {
    const { remoto, ana, bruno } = await casalSincronizado();
    expect(bruno.loja.obterFoto().estado.config).toMatchObject({ nomeA: 'Ana', nomeB: 'Bruno' });
    expect(bruno.loja.obterFoto().estado.categorias).toHaveLength(13);
    expect(ana.sync.obter().tipo).toBe('sincronizado');
    expect(ana.sync.pendentes()).toEqual([]);
    const bruto = JSON.stringify((await remoto.base.lerAPartirDe(0)).linhas);
    for (const palavra of ['Ana', 'Bruno', 'Moradia', 'Gatinhos']) expect(bruto).not.toContain(palavra);
  });

  it('lançamentos offline nos dois celulares chegam aos dois quando voltam a conexão', async () => {
    const { ana, bruno } = await casalSincronizado();
    ana.online = false;
    bruno.online = false;
    lancar(ana, 1000, 'Padaria');
    lancar(bruno, 2500, 'Farmácia');
    await ana.sync.sincronizar();
    expect(ana.sync.obter()).toEqual({ tipo: 'offline', pendentes: 1 });
    ana.online = true;
    bruno.online = true;
    await ana.sync.sincronizar();
    await bruno.sync.sincronizar();
    await ana.sync.sincronizar();
    expect(despesas(ana)).toEqual(despesas(bruno));
    expect(despesas(ana).map((d) => d[1])).toEqual(expect.arrayContaining(['Padaria', 'Farmácia']));
  });

  it('recorrente gerada offline pelos dois não duplica depois de sincronizar', async () => {
    const { ana, bruno } = await casalSincronizado();
    ana.loja.executar((e, ctx) =>
      criarRecorrente(e, {
        descricao: 'Internet', categoriaId: idCategoria(ana, 'Contas de Consumo'), pagador: 'A', tipoValor: 'fixo',
        valor: 11990, dia: 20, inicio: '2026-11', fim: null, pctA: null,
      }, ctx),
    );
    await ana.sync.sincronizar();
    await bruno.sync.sincronizar();
    ana.online = false;
    bruno.online = false;
    ana.agora = new Date('2026-12-02T09:00:00');
    bruno.agora = new Date('2026-12-02T09:05:00');
    ana.loja.executar((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    bruno.loja.executar((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    ana.online = true;
    bruno.online = true;
    for (const c of [ana, bruno, ana]) await c.sync.sincronizar();
    for (const c of [ana, bruno]) {
      const internet = c.loja.obterFoto().estado.despesas.filter((d) => d.descricao === 'Internet');
      expect(internet.map((d) => d.competencia).sort()).toEqual(['2026-11', '2026-12']);
    }
  });

  it('edição do mesmo campo nos dois, offline: os dois chegam ao mesmo valor (vale a mais recente)', async () => {
    const { ana, bruno } = await casalSincronizado();
    const id = lancar(ana, 12000, 'Mercado');
    await ana.sync.sincronizar();
    await bruno.sync.sincronizar();
    ana.online = false;
    bruno.online = false;
    ana.agora = new Date('2026-11-10T13:00:00');
    bruno.agora = new Date('2026-11-10T13:05:00');
    ana.loja.executar((e, ctx) => alterarDespesa(e, id, { valor: 13000 }, ctx));
    bruno.loja.executar((e, ctx) => alterarDespesa(e, id, { valor: 15000 }, ctx));
    ana.online = true;
    bruno.online = true;
    for (const c of [ana, bruno, ana]) await c.sync.sincronizar();
    for (const c of [ana, bruno]) {
      expect(c.loja.obterFoto().estado.despesas.find((d) => d.id === id)?.valor).toBe(15000);
    }
  });

  it('resposta perdida depois do envio: reenvia, e a linha repetida é ignorada por quem lê', async () => {
    const { remoto, ana, bruno } = await casalSincronizado();
    lancar(ana, 700, 'Café');
    remoto.perderResposta = true;
    await ana.sync.sincronizar();
    expect(ana.sync.obter().tipo).toBe('offline');
    await ana.sync.sincronizar();
    await bruno.sync.sincronizar();
    expect(remoto.base.tamanho).toBeGreaterThan(15);
    expect(bruno.loja.obterFoto().estado.despesas.filter((d) => d.descricao === 'Café')).toHaveLength(1);
  });

  it('depois de reabrir o app, não reenvia nem relê o que já sincronizou', async () => {
    const { remoto, dek, ana } = await casalSincronizado();
    const tamanho = remoto.base.tamanho;
    const leituras = vi.spyOn(remoto, 'lerAPartirDe');
    const novoSync = new Sincronizador({ loja: ana.loja, remoto, meta: ana.armazem, dek, online: () => true });
    await novoSync.sincronizar();
    expect(remoto.base.tamanho).toBe(tamanho);
    expect(leituras).toHaveBeenLastCalledWith(tamanho);
  });

  it('linhas de outro cofre (outra chave) são ignoradas', async () => {
    const { remoto, bruno } = await casalSincronizado();
    const intruso = await celular(remoto, await gerarDek());
    intruso.loja.executar((e, ctx) => definirNomes(e, 'X', 'Y', ctx));
    await intruso.sync.sincronizar();
    await bruno.sync.sincronizar();
    expect(bruno.sync.ilegiveis).toBeGreaterThan(0);
    expect(bruno.loja.obterFoto().estado.config.nomeA).toBe('Ana');
  });

  it('progresso salvo corrompido não quebra (no pior caso reenvia)', async () => {
    const { remoto, dek, ana } = await casalSincronizado();
    ana.armazem.meta.set('syncConfirmados', '{quebrado');
    const s = new Sincronizador({ loja: ana.loja, remoto, meta: ana.armazem, dek, online: () => true });
    await s.sincronizar();
    expect(s.obter().tipo).toBe('sincronizado');
  });
});

describe('estados e erros', () => {
  it('sem login: "Toque para sincronizar"; sem acesso: erro claro', async () => {
    const { remoto, ana } = await casalSincronizado();
    lancar(ana, 100, 'X');
    remoto.falharAnexar = new ErroSemAutorizacao();
    await ana.sync.sincronizar();
    expect(ana.sync.obter()).toEqual({ tipo: 'precisa-toque', pendentes: 1 });
    remoto.falharAnexar = new ErroSemAcesso();
    await ana.sync.sincronizar();
    expect(ana.sync.obter()).toMatchObject({ tipo: 'erro', mensagem: 'Esta conta não tem acesso à planilha.' });
  });

  it('erro temporário (ex.: limite da API): tenta de novo sozinho, esperando cada vez mais', async () => {
    vi.useFakeTimers();
    const { remoto, ana } = await casalSincronizado();
    lancar(ana, 100, 'X');
    remoto.falharLer = new ErroTemporario();
    await ana.sync.sincronizar();
    expect(ana.sync.obter()).toMatchObject({ tipo: 'erro', pendentes: 0 });
    await vi.advanceTimersByTimeAsync(ESPERA_MINIMA_MS + 10);
    await ana.sync.ocioso();
    expect(ana.sync.obter().tipo).toBe('erro'); // 2ª falha: agora espera o dobro
    remoto.falharLer = null;
    await vi.advanceTimersByTimeAsync(ESPERA_MINIMA_MS);
    await ana.sync.ocioso();
    expect(ana.sync.obter().tipo).toBe('erro');
    await vi.advanceTimersByTimeAsync(ESPERA_MINIMA_MS + 10);
    await ana.sync.ocioso();
    expect(ana.sync.obter().tipo).toBe('sincronizado');
    remoto.falharLer = new Error('esquisito');
    await ana.sync.sincronizar();
    expect(ana.sync.obter()).toMatchObject({ tipo: 'erro', mensagem: 'esquisito' });
    remoto.falharLer = 'texto' as unknown as Error;
    await ana.sync.sincronizar();
    expect(ana.sync.obter()).toMatchObject({ tipo: 'erro', mensagem: 'Erro ao sincronizar.' });
  });

  it('gatilhos: logo depois de lançar, ao voltar a conexão e a cada 30 s com o app na tela', async () => {
    vi.useFakeTimers();
    const { remoto, ana } = await casalSincronizado();
    const ouvintes = new Map<string, () => void>();
    const janela = {
      addEventListener: (nome: string, f: () => void) => ouvintes.set(nome, f),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const doc = { visibilityState: 'visible' } as Document;
    const anexar = vi.spyOn(remoto, 'anexar');
    const ler = vi.spyOn(remoto, 'lerAPartirDe');
    let avisos = 0;
    const cancelar = ana.sync.assinar(() => (avisos += 1));
    const parar = ana.sync.iniciar(janela, doc);
    await vi.advanceTimersByTimeAsync(0);
    await ana.sync.ocioso();

    lancar(ana, 100, 'Pão');
    expect(ana.sync.obter()).toEqual({ tipo: 'pendente', pendentes: 1 });
    await vi.advanceTimersByTimeAsync(ESPERA_APOS_LANCAMENTO_MS + 10);
    await ana.sync.ocioso();
    expect(anexar).toHaveBeenCalledTimes(1);
    expect(ana.sync.obter().tipo).toBe('sincronizado');

    const leiturasAntes = ler.mock.calls.length;
    await vi.advanceTimersByTimeAsync(INTERVALO_MS + 10);
    await ana.sync.ocioso();
    expect(ler.mock.calls.length).toBe(leiturasAntes + 1);

    ana.online = false;
    lancar(ana, 200, 'Leite');
    await vi.advanceTimersByTimeAsync(ESPERA_APOS_LANCAMENTO_MS + 10);
    await ana.sync.ocioso();
    expect(ana.sync.obter()).toEqual({ tipo: 'offline', pendentes: 1 });
    ana.online = true;
    ouvintes.get('online')?.();
    await vi.advanceTimersByTimeAsync(10);
    await ana.sync.ocioso();
    expect(ana.sync.obter().tipo).toBe('sincronizado');
    expect(avisos).toBeGreaterThan(3);
    parar();
    cancelar();
  });

  it('pedindo toque, lançar não agenda nova tentativa (espera a pessoa tocar)', async () => {
    vi.useFakeTimers();
    const { remoto, ana } = await casalSincronizado();
    remoto.falharAnexar = new ErroSemAutorizacao();
    const parar = ana.sync.iniciar();
    lancar(ana, 100, 'A');
    await vi.advanceTimersByTimeAsync(ESPERA_APOS_LANCAMENTO_MS + 10);
    await ana.sync.ocioso();
    expect(ana.sync.obter().tipo).toBe('precisa-toque');
    const anexar = vi.spyOn(remoto, 'anexar');
    lancar(ana, 100, 'B');
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3);
    await ana.sync.ocioso();
    expect(anexar).not.toHaveBeenCalled();
    parar();
  });
});
