import { describe, expect, it } from 'vitest';
import { LocalEmMemoria } from '../armazenamento/local.ts';
import { criarDespesa } from '../dominio/despesas.ts';
import { divergenciasDeFechamento, resumoDoMes } from '../dominio/fechamento.ts';
import { mesFechado } from '../dominio/estado.ts';
import { LIVRO_CASA } from '../dominio/tipos.ts';
import { semearDemonstracao } from './demo.ts';
import { Loja } from './loja.ts';

const HOJE = new Date('2026-11-22T15:00:00');

async function lojaDemo(repo = new LocalEmMemoria()) {
  const loja = new Loja(repo, () => HOJE);
  await loja.iniciar((l) => {
    semearDemonstracao(l, HOJE);
  });
  await loja.aguardarGravacao();
  return { loja, repo };
}

describe('Loja + modo demonstração', () => {
  it('semeia 3 meses fictícios coerentes', async () => {
    const { loja } = await lojaDemo();
    const { estado } = loja.obterFoto();
    expect(estado.config).toMatchObject({ nomeA: 'Ana', nomeB: 'Bruno' });
    expect(mesFechado(estado, LIVRO_CASA, '2026-09')).toBe(true);
    expect(mesFechado(estado, LIVRO_CASA, '2026-10')).toBe(false);
    expect(divergenciasDeFechamento(estado, LIVRO_CASA)).toEqual([]);
    const nov = resumoDoMes(estado, LIVRO_CASA, '2026-11');
    expect(nov.aguardando.map((d) => d.descricao)).toEqual(['Conta de luz']);
    expect(nov.contadas.length).toBeGreaterThan(5);
    expect(estado.despesas.filter((d) => d.origem.tipo === 'parcela' && !d.excluida)).toHaveLength(10);
    expect(estado.despesas.some((d) => d.editada && d.alteradoPor !== d.criadoPor)).toBe(true);
  });

  it('reabre do banco local sem duplicar nada', async () => {
    const { loja, repo } = await lojaDemo();
    const total = loja.todosEventos.length;
    const outra = new Loja(repo, () => HOJE);
    await outra.iniciar(() => {
      throw new Error('não deveria semear de novo');
    });
    expect(outra.todosEventos.length).toBe(total);
    expect(outra.obterFoto().estado.despesas).toEqual(loja.obterFoto().estado.despesas);
  });

  it('executa regras, avisa a interface e guarda quem usa o aparelho', async () => {
    const { loja, repo } = await lojaDemo();
    let avisos = 0;
    const cancelar = loja.assinar(() => (avisos += 1));
    const r = loja.executar((e, ctx) =>
      criarDespesa(e, {
        valor: 1000, descricao: 'Teste', data: '2026-11-22', competencia: '2026-11',
        categoriaId: e.categorias[0]?.id ?? '', pagador: 'B', pctA: 5000, pctPadrao: true,
      }, ctx),
    );
    expect(r.ok).toBe(true);
    const recusada = loja.executar((e, ctx) => criarDespesa(e, { valor: 0, descricao: '', data: 'x', competencia: 'x', categoriaId: '', pagador: 'A', pctA: 1, pctPadrao: true }, ctx));
    expect(recusada.ok).toBe(false);
    await loja.definirEuSou('B');
    expect(loja.obterFoto().euSou).toBe('B');
    expect(await repo.lerMeta('euSou')).toBe('B');
    expect(avisos).toBe(2);
    cancelar();
    await loja.aguardarGravacao();
    expect((await repo.carregarEventos()).length).toBe(loja.todosEventos.length);
  });

  it('apagar tudo recomeça a demonstração', async () => {
    const { loja } = await lojaDemo();
    await loja.definirEuSou('B');
    await loja.apagarTudo((l) => {
      semearDemonstracao(l, HOJE);
    });
    expect(loja.obterFoto().euSou).toBe('A');
    expect(loja.obterFoto().estado.config.nomeA).toBe('Ana');
  });

  it('mostra o erro se o banco local falhar ao gravar', async () => {
    const repo = new LocalEmMemoria();
    const { loja } = await lojaDemo(repo);
    repo.salvarEventos = () => Promise.reject(new Error('disco cheio'));
    loja.executar((e, ctx) =>
      criarDespesa(e, {
        valor: 1000, descricao: 'Teste', data: '2026-11-22', competencia: '2026-11',
        categoriaId: e.categorias[0]?.id ?? '', pagador: 'B', pctA: 5000, pctPadrao: true,
      }, ctx),
    );
    await loja.aguardarGravacao();
    expect(loja.obterFoto().erroAoSalvar).toBe('disco cheio');
  });
});
