// Casos obrigatórios da Fase 1 (pedido do dono). Dados fictícios: Ana (A) e Bruno (B).

import { describe, expect, it } from 'vitest';
import { alterarCategoria } from './categorias.ts';
import { alterarDespesa, criarDespesa, moverParaMesAberto } from './despesas.ts';
import { dividir } from './divisao.ts';
import { despesaPorId, despesasDoMes, fechamentoDe, mesFechado } from './estado.ts';
import { divergenciasDeFechamento, fecharMes, reabrirMes, resumoDoMes } from './fechamento.ts';
import { criarParcelamento, idParcela } from './parcelamentos.ts';
import { projetar } from './projecao.ts';
import { criarRecorrente, gerarRecorrentesPendentes, idOcorrencia } from './recorrentes.ts';
import { fraseDoSaldo } from './saldo.ts';
import { LIVRO_CASA } from './tipos.ts';
import { lerEstado } from './estado.ts';
import { AparelhoDeTeste, embaralhar, idCategoria, iniciarCasa, sincronizar } from './testes/aparelho.ts';

function casal(hoje = '2026-11-10') {
  const ana = new AparelhoDeTeste('celAna', 'A', hoje);
  const bruno = new AparelhoDeTeste('celBruno', 'B', hoje);
  iniciarCasa(ana);
  sincronizar(ana, bruno);
  return { ana, bruno };
}

describe('1. Arredondamento de centavos', () => {
  it('quem pagou absorve o centavo que sobra', () => {
    expect(dividir(1001, 5000, 'A')).toEqual({ A: 501, B: 500 });
    expect(dividir(1001, 5000, 'B')).toEqual({ A: 500, B: 501 });
  });

  it('a soma das cotas é sempre exatamente o valor', () => {
    for (let valor = 1; valor <= 2000; valor += 7) {
      for (const pct of [0, 1, 3333, 5000, 5835, 6667, 9999, 10000]) {
        for (const pagador of ['A', 'B'] as const) {
          const c = dividir(valor, pct, pagador);
          expect(c.A + c.B).toBe(valor);
        }
      }
    }
  });

  it('o saldo do mês fecha no centavo', () => {
    const { ana } = casal();
    const estado = ana.estado();
    const outros = idCategoria(estado, 'Outros');
    for (const [valor, pagador] of [[1001, 'A'], [333, 'B'], [1, 'A']] as const) {
      ana.fazer((e, ctx) =>
        criarDespesa(e, {
          valor, descricao: 'Teste', data: '2026-11-05', competencia: '2026-11',
          categoriaId: outros, pagador, pctA: 5000, pctPadrao: true,
        }, ctx),
      );
    }
    const r = resumoDoMes(ana.estado(), LIVRO_CASA, '2026-11');
    // A pagou 1002, B pagou 333. Cotas: 1001→A501/B500; 333 (B pagou)→A166/B167; 1→A1/B0.
    expect(r.cotaDe).toEqual({ A: 668, B: 667 });
    expect(r.cotaDe.A + r.cotaDe.B).toBe(r.totalGasto);
    expect(r.saldoA).toBe(1002 - 668);
    expect(fraseDoSaldo(r.transferencia, ana.estado().config)).toBe('Bruno deve R$ 3,34 para Ana');
  });
});

describe('2. Recorrentes e parcelas idempotentes com dois aparelhos offline', () => {
  it('os dois celulares geram a mesma recorrente offline e nada duplica', () => {
    const { ana, bruno } = casal('2026-09-15');
    const moradia = idCategoria(ana.estado(), 'Moradia');
    ana.fazer((e, ctx) =>
      criarRecorrente(e, {
        descricao: 'Aluguel', categoriaId: moradia, pagador: 'A', tipoValor: 'fixo',
        valor: 250000, dia: 5, inicio: '2026-09', fim: null, pctA: null,
      }, ctx),
    );
    sincronizar(ana, bruno);

    // Dois meses depois, ambos abrem o app OFFLINE e geram as pendentes.
    ana.mudarDia('2026-11-02');
    bruno.mudarDia('2026-11-03');
    const geradosAna = ana.fazer((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    const geradosBruno = bruno.fazer((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    // Cada um criou os próprios eventos (outubro e novembro), com ids de evento diferentes…
    expect(geradosAna).toHaveLength(2);
    expect(geradosBruno).toHaveLength(2);
    // …mas apontando para as MESMAS despesas (id determinístico).
    expect(geradosAna.map((e) => e.entidadeId)).toEqual(geradosBruno.map((e) => e.entidadeId));

    sincronizar(ana, bruno);
    const recorrenteId = ana.estado().recorrentes[0]?.id ?? '';
    for (const aparelho of [ana, bruno]) {
      const aluguel = aparelho.estado().despesas.filter((d) => d.descricao === 'Aluguel');
      expect(aluguel.map((d) => d.competencia).sort()).toEqual(['2026-09', '2026-10', '2026-11']);
      expect(aluguel.map((d) => d.id)).toContain(idOcorrencia(recorrenteId, '2026-11'));
    }
    // Os dois aparelhos chegaram exatamente ao mesmo estado.
    expect(ana.estado().despesas).toEqual(bruno.estado().despesas);
  });

  it('vale a primeira criação (menor HLC), não importa a ordem de chegada', () => {
    const { ana, bruno } = casal('2026-10-01');
    const luz = idCategoria(ana.estado(), 'Contas de Consumo');
    ana.fazer((e, ctx) =>
      criarRecorrente(e, {
        descricao: 'Internet', categoriaId: luz, pagador: 'B', tipoValor: 'fixo',
        valor: 10000, dia: 10, inicio: '2026-10', fim: null, pctA: null,
      }, ctx),
    );
    sincronizar(ana, bruno);
    ana.mudarDia('2026-11-01');
    bruno.mudarDia('2026-11-01');
    bruno.avancarMinutos(5); // Bruno gera 5 minutos depois de Ana
    ana.fazer((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    bruno.fazer((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    sincronizar(ana, bruno);

    const todos = ana.eventos;
    for (const semente of [1, 2, 3, 42, 99]) {
      const estado = lerEstado(projetar(embaralhar(todos, semente)));
      const nov = estado.despesas.filter((d) => d.competencia === '2026-11' && d.descricao === 'Internet');
      expect(nov).toHaveLength(1);
      expect(nov[0]?.criadoPor).toBe('A');
    }
  });

  it('parcelas replicadas entre aparelhos também não duplicam', () => {
    const { ana, bruno } = casal('2026-11-10');
    const compras = idCategoria(ana.estado(), 'Compras');
    const [criacao] = ana.fazer((e, ctx) =>
      criarParcelamento(e, {
        descricao: 'Sofá', categoriaId: compras, pagador: 'A', pctA: 5000, pctPadrao: true,
        n: 10, valorParcela: 45000, dataCompra: '2026-11-10', primeiraCompetencia: '2026-11',
      }, ctx),
    );
    sincronizar(ana, bruno);
    // Simula o mesmo lote chegando duas vezes (retentativa de envio).
    bruno.eventos.push(...ana.eventos.slice(-11).map((e) => ({ ...e, id: `${e.id}-reenvio` })));
    const parcelas = bruno.estado().despesas.filter((d) => d.origem.tipo === 'parcela');
    expect(parcelas).toHaveLength(10);
    expect(parcelas.map((d) => d.competencia)).toContain('2027-08');
    expect(despesaPorId(bruno.estado(), idParcela(criacao?.entidadeId ?? '', 3))?.competencia).toBe('2027-01');
  });
});

describe('3. Conflito de edição', () => {
  it('mesmo campo editado offline pelos dois: vale o de maior HLC, e as duas versões ficam no histórico', () => {
    const { ana, bruno } = casal();
    const mercado = idCategoria(ana.estado(), 'Despesas da Casa');
    const [criada] = ana.fazer((e, ctx) =>
      criarDespesa(e, {
        valor: 12000, descricao: 'Mercado', data: '2026-11-08', competencia: '2026-11',
        categoriaId: mercado, pagador: 'A', pctA: 6000, pctPadrao: true,
      }, ctx),
    );
    const id = criada?.entidadeId ?? '';
    sincronizar(ana, bruno);

    ana.avancarMinutos(1);
    bruno.avancarMinutos(2); // Bruno edita depois
    ana.fazer((e, ctx) => alterarDespesa(e, id, { valor: 13000 }, ctx));
    bruno.fazer((e, ctx) => alterarDespesa(e, id, { valor: 15000 }, ctx));
    sincronizar(ana, bruno);

    for (const aparelho of [ana, bruno]) {
      const d = despesaPorId(aparelho.estado(), id);
      expect(d?.valor).toBe(15000);
      expect(d?.alteradoPor).toBe('B');
      const historico = aparelho.estado().projecao.eventos.filter((e) => e.entidadeId === id);
      expect(historico.map((e) => e.campos['valor'])).toEqual([12000, 13000, 15000]);
    }
  });

  it('campos diferentes editados pelos dois: as duas mudanças ficam', () => {
    const { ana, bruno } = casal();
    const cat = idCategoria(ana.estado(), 'Outros');
    const [criada] = ana.fazer((e, ctx) =>
      criarDespesa(e, {
        valor: 5000, descricao: 'Farmácia', data: '2026-11-08', competencia: '2026-11',
        categoriaId: cat, pagador: 'A', pctA: 5000, pctPadrao: true,
      }, ctx),
    );
    const id = criada?.entidadeId ?? '';
    sincronizar(ana, bruno);
    ana.fazer((e, ctx) => alterarDespesa(e, id, { descricao: 'Farmácia Central' }, ctx));
    bruno.fazer((e, ctx) => alterarDespesa(e, id, { valor: 5500 }, ctx));
    sincronizar(ana, bruno);
    expect(despesaPorId(ana.estado(), id)).toMatchObject({ descricao: 'Farmácia Central', valor: 5500 });
    expect(despesaPorId(bruno.estado(), id)).toMatchObject({ descricao: 'Farmácia Central', valor: 5500 });
  });

  it('relógio do celular atrasado não faz a edição nova perder', () => {
    const { ana, bruno } = casal();
    const cat = idCategoria(ana.estado(), 'Outros');
    const [criada] = ana.fazer((e, ctx) =>
      criarDespesa(e, {
        valor: 1000, descricao: 'Pão', data: '2026-11-08', competencia: '2026-11',
        categoriaId: cat, pagador: 'A', pctA: 5000, pctPadrao: true,
      }, ctx),
    );
    sincronizar(ana, bruno);
    bruno.agoraMs -= 3_600_000; // relógio do Bruno 1 hora atrasado
    bruno.fazer((e, ctx) => alterarDespesa(e, criada?.entidadeId ?? '', { valor: 1100 }, ctx));
    sincronizar(ana, bruno);
    expect(despesaPorId(ana.estado(), criada?.entidadeId ?? '')?.valor).toBe(1100);
  });
});

describe('4. Mudança do % de categoria sem afetar meses fechados', () => {
  it('aplica só às despesas de meses abertos que usam o % padrão', () => {
    const { ana } = casal('2026-10-05');
    const moradia = idCategoria(ana.estado(), 'Moradia');
    const nova = (data: string, pctA: number, pctPadrao: boolean) =>
      ana.fazer((e, ctx) =>
        criarDespesa(e, {
          valor: 10000, descricao: 'Condomínio', data, competencia: data.slice(0, 7),
          categoriaId: moradia, pagador: 'A', pctA, pctPadrao,
        }, ctx),
      )[0]?.entidadeId ?? '';

    const outubro = nova('2026-10-05', 6000, true);
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-10', ctx));
    ana.mudarDia('2026-11-05');
    const novembroPadrao = nova('2026-11-05', 6000, true);
    const novembroManual = nova('2026-11-06', 7000, false);

    const antes = ana.estado();
    const cat = antes.categorias.find((c) => c.id === moradia);
    ana.fazer((e, ctx) =>
      alterarCategoria(e, moradia, { nome: cat?.nome ?? '', icone: cat?.icone ?? '', cor: cat?.cor ?? '', pctA: 5500 }, true, ctx),
    );
    const depois = ana.estado();
    expect(depois.categorias.find((c) => c.id === moradia)?.pctA).toBe(5500);
    expect(despesaPorId(depois, novembroPadrao)?.pctA).toBe(5500);
    expect(despesaPorId(depois, novembroManual)?.pctA).toBe(7000);
    expect(despesaPorId(depois, outubro)?.pctA).toBe(6000);
    expect(resumoDoMes(depois, LIVRO_CASA, '2026-10')).toEqual(resumoDoMes(antes, LIVRO_CASA, '2026-10'));
  });

  it('se o usuário não quiser aplicar, só as despesas novas usam o novo %', () => {
    const { ana } = casal('2026-11-05');
    const moradia = idCategoria(ana.estado(), 'Moradia');
    const [criada] = ana.fazer((e, ctx) =>
      criarDespesa(e, {
        valor: 10000, descricao: 'Condomínio', data: '2026-11-05', competencia: '2026-11',
        categoriaId: moradia, pagador: 'A', pctA: 6000, pctPadrao: true,
      }, ctx),
    );
    const cat = ana.estado().categorias.find((c) => c.id === moradia);
    ana.fazer((e, ctx) =>
      alterarCategoria(e, moradia, { nome: cat?.nome ?? '', icone: cat?.icone ?? '', cor: cat?.cor ?? '', pctA: 5000 }, false, ctx),
    );
    expect(despesaPorId(ana.estado(), criada?.entidadeId ?? '')?.pctA).toBe(6000);
  });
});

describe('5. Fechamento e reabertura de mês', () => {
  function comDespesas() {
    const { ana, bruno } = casal('2026-11-20');
    const cat = idCategoria(ana.estado(), 'Despesas da Casa');
    const lancar = (quem: AparelhoDeTeste, valor: number, pagador: 'A' | 'B', data = '2026-11-10') =>
      quem.fazer((e, ctx) =>
        criarDespesa(e, {
          valor, descricao: 'Mercado', data, competencia: data.slice(0, 7),
          categoriaId: cat, pagador, pctA: 5000, pctPadrao: true,
        }, ctx),
      )[0]?.entidadeId ?? '';
    return { ana, bruno, lancar };
  }

  it('fechar registra a transferência e trava o mês', () => {
    const { ana, lancar } = comDespesas();
    const id = lancar(ana, 10000, 'A');
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    const estado = ana.estado();
    expect(mesFechado(estado, LIVRO_CASA, '2026-11')).toBe(true);
    expect(fechamentoDe(estado, LIVRO_CASA, '2026-11')).toMatchObject({
      transferenciaDe: 'B', valorTransferencia: 5000, totalGasto: 10000, fechadoPor: 'A',
    });
    // Travado: não dá para lançar, editar nem excluir.
    expect(alterarDespesa(estado, id, { valor: 1 }, ana.ctx)).toMatchObject({ ok: false, erro: 'mes-fechado' });
    expect(
      criarDespesa(estado, {
        valor: 100, descricao: 'X', data: '2026-11-11', competencia: '2026-11',
        categoriaId: idCategoria(estado, 'Outros'), pagador: 'A', pctA: 5000, pctPadrao: true,
      }, ana.ctx),
    ).toMatchObject({ ok: false, erro: 'mes-fechado', competencia: '2026-11' });
    // Fechar de novo é recusado.
    expect(fecharMes(estado, LIVRO_CASA, '2026-11', ana.ctx).ok).toBe(false);
  });

  it('fechar com atraso (em dezembro) não mistura meses', () => {
    const { ana, lancar } = comDespesas();
    lancar(ana, 10000, 'A', '2026-11-28');
    ana.mudarDia('2026-12-05');
    lancar(ana, 7000, 'B', '2026-12-02');
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    const estado = ana.estado();
    expect(fechamentoDe(estado, LIVRO_CASA, '2026-11')?.totalGasto).toBe(10000);
    expect(mesFechado(estado, LIVRO_CASA, '2026-12')).toBe(false);
    expect(resumoDoMes(estado, LIVRO_CASA, '2026-12').totalGasto).toBe(7000);
  });

  it('reabrir destrava o mês e fica no histórico', () => {
    const { ana, lancar } = comDespesas();
    const id = lancar(ana, 10000, 'A');
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    ana.fazer((e, ctx) => reabrirMes(e, LIVRO_CASA, '2026-11', ctx));
    expect(mesFechado(ana.estado(), LIVRO_CASA, '2026-11')).toBe(false);
    ana.fazer((e, ctx) => alterarDespesa(e, id, { valor: 12000 }, ctx));
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    expect(fechamentoDe(ana.estado(), LIVRO_CASA, '2026-11')?.valorTransferencia).toBe(6000);
    const historico = ana.eventos.filter((e) => e.entidade === 'fechamento').map((e) => e.campos['status']);
    expect(historico).toEqual(['fechado', 'aberto', 'fechado']);
    expect(reabrirMes(lerEstado(projetar(ana.eventos.slice(0, -2))), LIVRO_CASA, '2026-12', ana.ctx).ok).toBe(false);
  });

  it('despesa lançada offline que chega depois do fechamento é detectada e pode ser movida', () => {
    const { ana, bruno, lancar } = comDespesas();
    lancar(ana, 10000, 'A');
    sincronizar(ana, bruno);
    // Bruno, offline no mercado, lança em novembro…
    const tardia = lancar(bruno, 3000, 'B', '2026-11-19');
    // …enquanto Ana fecha novembro.
    ana.avancarMinutos(10);
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    sincronizar(ana, bruno);

    for (const aparelho of [ana, bruno]) {
      const [div] = divergenciasDeFechamento(aparelho.estado(), LIVRO_CASA);
      expect(div?.fechamento.competencia).toBe('2026-11');
      expect(div?.chegaramDepois.map((d) => d.id)).toEqual([tardia]);
      expect(div?.contaMudou).toBe(false);
    }
    // O fechamento continua como foi feito: meses fechados nunca mudam.
    expect(fechamentoDe(ana.estado(), LIVRO_CASA, '2026-11')?.totalGasto).toBe(10000);

    bruno.fazer((e, ctx) => moverParaMesAberto(e, tardia, ctx));
    expect(despesaPorId(bruno.estado(), tardia)?.competencia).toBe('2026-12');
    expect(divergenciasDeFechamento(bruno.estado(), LIVRO_CASA)).toEqual([]);
    expect(despesasDoMes(bruno.estado(), LIVRO_CASA, '2026-12').map((d) => d.id)).toEqual([tardia]);
  });

  it('a despesa tardia também pode ser resolvida reabrindo o mês', () => {
    const { ana, bruno, lancar } = comDespesas();
    sincronizar(ana, bruno);
    lancar(bruno, 3000, 'B', '2026-11-19');
    ana.avancarMinutos(10);
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    sincronizar(ana, bruno);
    ana.fazer((e, ctx) => reabrirMes(e, LIVRO_CASA, '2026-11', ctx));
    expect(divergenciasDeFechamento(ana.estado(), LIVRO_CASA)).toEqual([]);
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    expect(fechamentoDe(ana.estado(), LIVRO_CASA, '2026-11')?.totalGasto).toBe(3000);
  });

  it('edição offline de despesa já contada é detectada como "conta mudou"', () => {
    const { ana, bruno, lancar } = comDespesas();
    const id = lancar(ana, 10000, 'A');
    sincronizar(ana, bruno);
    bruno.fazer((e, ctx) => alterarDespesa(e, id, { valor: 11000 }, ctx));
    ana.avancarMinutos(10);
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    sincronizar(ana, bruno);
    const [div] = divergenciasDeFechamento(ana.estado(), LIVRO_CASA);
    expect(div?.contaMudou).toBe(true);
    expect(div?.chegaramDepois).toEqual([]);
  });
});
