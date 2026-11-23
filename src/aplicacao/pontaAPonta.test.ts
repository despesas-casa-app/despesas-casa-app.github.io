// Teste de ponta a ponta (Fase 5): o mês inteiro de um casal, nos dois celulares, com um
// "Google" de mentira em memória. Só dados fictícios (Ana e Bruno, valores inventados).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gerarFrase } from '../cripto/frase.ts';
import { criarDespesa, alterarDespesa, moverParaMesAberto } from '../dominio/despesas.ts';
import { despesasDoMes, fechamentoDe, mesFechado, type Estado } from '../dominio/estado.ts';
import { divergenciasDeFechamento, fecharMes, resumoDoMes } from '../dominio/fechamento.ts';
import { criarParcelamento } from '../dominio/parcelamentos.ts';
import { criarRecorrente, gerarRecorrentesPendentes } from '../dominio/recorrentes.ts';
import { LIVRO_CASA } from '../dominio/tipos.ts';
import { idCategoria } from '../dominio/testes/aparelho.ts';
import { recuperar } from '../recuperacao/recuperar.ts';
import type { Loja } from './loja.ts';
import { GoogleFalso, primeiraPessoa, segundaPessoa, type PlanilhaFalsa } from './testes/googleFalso.ts';

function ok(r: { ok: boolean }): void {
  if (!r.ok) throw new Error(`a regra recusou: ${JSON.stringify(r)}`);
}

function estado(loja: Loja): Estado {
  return loja.obterFoto().estado;
}

/** Retrato comparável do que cada celular vê (para conferir que os dois ficaram iguais). */
function retrato(loja: Loja): string[] {
  return estado(loja)
    .despesas.filter((d) => !d.excluida)
    .map((d) => `${d.competencia}|${d.descricao}|${String(d.valor)}|${d.pagador}|${d.status}`)
    .sort();
}

/** CSVs como o Google Planilhas exporta as abas "meta" e "eventos". */
function csvsDaPlanilha(planilha: PlanilhaFalsa, linhas: readonly { id: string; versao: number; conteudo: string }[]) {
  const celula = (v: string | number): string => {
    const t = String(v);
    return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
  };
  const meta = ['chave,valor', 'formato,viver-gasta-v1', ...planilha.metas.map((m) => `cofre,${celula(JSON.stringify(m))}`)].join('\r\n');
  const eventos = ['id,versao,conteudo', ...linhas.map((l) => [l.id, l.versao, l.conteudo].map(celula).join(','))].join('\r\n');
  return { meta, eventos };
}

describe('de ponta a ponta: um mês do casal nos dois celulares', () => {
  beforeEach(() => {
    // Relógio fixo em 15/11/2026 (só a data; os timers continuam reais).
    vi.useFakeTimers({ now: new Date('2026-11-15T12:00:00'), toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('onboarding, online e offline, recorrente variável, parcelado, acerto e recuperação', async () => {
    // 1. Onboarding dos dois: Ana cria o cofre com a planilha; Bruno entra com a frase.
    const google = new GoogleFalso();
    const ana = await primeiraPessoa(google);
    const bruno = await segundaPessoa(google, ana.planilha.id, ana.palavras);
    expect(ana.loja.obterFoto().euSou).toBe('A');
    expect(bruno.loja.obterFoto().euSou).toBe('B');
    expect(bruno.sync.obter().tipo).toBe('sincronizado');
    const cat = (nome: string): string => idCategoria(estado(ana.loja), nome);

    // 2. Lançamento online: aparece no outro celular depois de sincronizar.
    ok(ana.loja.executar((e, ctx) => criarDespesa(e, {
      valor: 20000, descricao: 'Mercado', data: '2026-11-05', competencia: '2026-11',
      categoriaId: cat('Despesas da Casa'), pagador: 'A', pctA: 6000, pctPadrao: true,
    }, ctx)));
    await ana.sync.sincronizar();
    await bruno.sync.sincronizar();
    expect(retrato(bruno.loja)).toContain('2026-11|Mercado|20000|A|normal');

    // 3. Recorrente de valor variável: nasce "aguardando valor"; o outro preenche.
    ok(ana.loja.executar((e, ctx) => criarRecorrente(e, {
      descricao: 'Luz', categoriaId: cat('Contas de Consumo'), pagador: 'A', tipoValor: 'variavel',
      valor: 0, dia: 10, inicio: '2026-11', fim: null, pctA: null,
    }, ctx)));
    ana.loja.executar((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    await ana.sync.sincronizar();
    await bruno.sync.sincronizar();
    const luz = estado(bruno.loja).despesas.find((d) => d.descricao === 'Luz');
    expect(luz?.status).toBe('aguardando');
    expect(resumoDoMes(estado(bruno.loja), LIVRO_CASA, '2026-11').aguardando).toHaveLength(1);
    ok(bruno.loja.executar((e, ctx) => alterarDespesa(e, luz?.id ?? '', { valor: 15000 }, ctx)));
    await bruno.sync.sincronizar();
    await ana.sync.sincronizar();
    expect(retrato(ana.loja)).toContain('2026-11|Luz|15000|A|normal');

    // 4. Compra parcelada: 3 parcelas, uma em cada mês, nos dois celulares.
    ok(bruno.loja.executar((e, ctx) => criarParcelamento(e, {
      descricao: 'TV', categoriaId: cat('Compras'), pagador: 'B', pctA: 5000, pctPadrao: true,
      n: 3, valorTotal: 90000, dataCompra: '2026-11-12', primeiraCompetencia: '2026-11',
    }, ctx)));
    await bruno.sync.sincronizar();
    await ana.sync.sincronizar();
    const tvs = estado(ana.loja).despesas.filter((d) => d.descricao.startsWith('TV'));
    expect(tvs.map((d) => [d.competencia, d.valor]).sort()).toEqual([
      ['2026-11', 30000],
      ['2026-12', 30000],
      ['2027-01', 30000],
    ]);

    // 5. Offline: Bruno lança sem internet; fica pendente e não se perde.
    bruno.remoto.semInternet = true;
    ok(bruno.loja.executar((e, ctx) => criarDespesa(e, {
      valor: 1000, descricao: 'Café', data: '2026-11-15', competencia: '2026-11',
      categoriaId: cat('Despesas da Casa'), pagador: 'B', pctA: 6000, pctPadrao: true,
    }, ctx)));
    await bruno.sync.sincronizar();
    expect(bruno.sync.obter()).toMatchObject({ tipo: 'offline', pendentes: 1 });

    // 6. Acerto: enquanto isso, Ana acerta novembro (sem o café, que ainda não chegou).
    const nov = resumoDoMes(estado(ana.loja), LIVRO_CASA, '2026-11');
    // Mercado: Ana pagou 200, parte dela 120 → +80 · Luz: +150 − 90 = +60 · TV 1/3: Bruno pagou 300 → −150
    expect(nov.saldoA).toBe(8000 + 6000 - 15000);
    expect(nov.transferencia).toEqual({ de: 'A', para: 'B', valor: 1000 });
    ok(ana.loja.executar((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx)));
    await ana.sync.sincronizar();

    // 7. Bruno volta a ter internet: envia o café e recebe o acerto. O café chegou depois do acerto
    //    e vai para o mês em aberto (a janela "Esse mês já está fechado").
    bruno.remoto.semInternet = false;
    await bruno.sync.sincronizar();
    expect(bruno.sync.obter().tipo).toBe('sincronizado');
    expect(bruno.sync.pendentes()).toEqual([]);
    expect(mesFechado(estado(bruno.loja), LIVRO_CASA, '2026-11')).toBe(true);
    const [divergencia] = divergenciasDeFechamento(estado(bruno.loja), LIVRO_CASA);
    expect(divergencia?.chegaramDepois.map((d) => d.descricao)).toEqual(['Café']);
    expect(divergencia?.contaMudou).toBe(false);
    const cafe = divergencia?.chegaramDepois[0]?.id ?? '';
    ok(bruno.loja.executar((e, ctx) => moverParaMesAberto(e, cafe, ctx)));
    await bruno.sync.sincronizar();
    await ana.sync.sincronizar();
    expect(despesasDoMes(estado(ana.loja), LIVRO_CASA, '2026-12').map((d) => d.descricao).sort()).toEqual(['Café', 'TV']); // a parcela 2/3
    expect(divergenciasDeFechamento(estado(ana.loja), LIVRO_CASA)).toEqual([]);

    // Os dois celulares terminam iguais, com o mesmo acerto.
    expect(retrato(bruno.loja)).toEqual(retrato(ana.loja));
    expect(fechamentoDe(estado(bruno.loja), LIVRO_CASA, '2026-11')).toMatchObject({ saldoA: -1000, transferenciaDe: 'A', valorTransferencia: 1000 });

    // 8. Recuperação: só com os CSVs das abas e a frase, sem nenhum celular.
    const leitura = await ana.planilha.lerAPartirDe(0);
    const csvs = csvsDaPlanilha(ana.planilha, leitura.linhas);
    expect(csvs.eventos).not.toContain('Mercado'); // na planilha, tudo cifrado
    const rec = await recuperar(csvs.meta, csvs.eventos, ana.palavras.join(' '));
    expect(rec.ilegiveis).toBe(0);
    expect(rec.eventos).toBe(leitura.linhas.length);
    for (const nome of ['Mercado', 'Luz', 'TV 1/3', 'TV 3/3', 'Café']) expect(rec.despesasCsv).toContain(nome);
    expect(rec.acertosCsv).toContain('novembro de 2026;acertado;');
    expect(retrato({ obterFoto: () => ({ estado: rec.estado }) } as unknown as Loja)).toEqual(retrato(ana.loja));
    // Com outra frase, não abre.
    await expect(recuperar(csvs.meta, csvs.eventos, gerarFrase().join(' '))).rejects.toThrow('não é a frase');
  });
});
