// Edição completa de recorrentes e parcelamentos. Dados sempre fictícios.
import { describe, expect, it } from 'vitest';
import { gerarAtividade } from './atividade.ts';
import { alterarDespesa, excluirDespesa } from './despesas.ts';
import { formatarReais } from './dinheiro.ts';
import { VALOR_MAXIMO } from './divisao.ts';
import { despesaPorId, type Estado } from './estado.ts';
import { fecharMes } from './fechamento.ts';
import {
  cancelarParcelasRestantes,
  criarParcelamento,
  editarParcelamento,
  idParcela,
  parcelasDe,
  type DadosParcelamento,
} from './parcelamentos.ts';
import {
  criarRecorrente,
  editarRecorrente,
  encerrarRecorrente,
  idOcorrencia,
  ocorrenciasEmAberto,
  type DadosRecorrente,
} from './recorrentes.ts';
import { LIVRO_CASA } from './tipos.ts';
import { AparelhoDeTeste, idCategoria, iniciarCasa } from './testes/aparelho.ts';

function novaCasa(hoje: string) {
  const ana = new AparelhoDeTeste('celAna', 'A', hoje);
  iniciarCasa(ana); // categorias proporcionais em 60%
  return ana;
}

function feed(ana: AparelhoDeTeste): string[] {
  return gerarAtividade(ana.eventos, ana.estado().config).flatMap((i) => i.textos);
}

describe('editar recorrente', () => {
  function aluguel(estado: Estado, extra: Partial<DadosRecorrente> = {}): DadosRecorrente {
    return {
      descricao: 'Aluguel', categoriaId: idCategoria(estado, 'Moradia'), pagador: 'A',
      tipoValor: 'fixo', valor: 200000, dia: 5, inicio: '2026-09', fim: null, pctA: null, ...extra,
    };
  }

  /** Aluguel de set/26 em diante; setembro acertado; novembro mudado à mão para R$ 2.050. */
  function cenario() {
    const ana = novaCasa('2026-11-10');
    ana.fazer((e, ctx) => criarRecorrente(e, aluguel(e), ctx));
    const id = ana.estado().recorrentes[0]?.id ?? '';
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-09', ctx));
    ana.fazer((e, ctx) => alterarDespesa(e, idOcorrencia(id, '2026-11'), { valor: 205000 }, ctx));
    return { ana, id };
  }

  it('atualiza as já lançadas em mês aberto, sem mexer no que foi mudado à mão nem em mês fechado', () => {
    const { ana, id } = cenario();
    expect(ocorrenciasEmAberto(ana.estado(), id).map((d) => d.competencia)).toEqual(['2026-10', '2026-11']);
    ana.fazer((e, ctx) =>
      editarRecorrente(e, id, aluguel(e, { descricao: 'Aluguel novo', valor: 210000, dia: 31, pagador: 'B' }), true, ctx),
    );
    const e = ana.estado();
    expect(e.recorrentes[0]).toMatchObject({ descricao: 'Aluguel novo', valor: 210000, dia: 31, pagador: 'B' });
    expect(despesaPorId(e, idOcorrencia(id, '2026-09'))).toMatchObject({ descricao: 'Aluguel', valor: 200000, data: '2026-09-05', pagador: 'A' });
    expect(despesaPorId(e, idOcorrencia(id, '2026-10'))).toMatchObject({ descricao: 'Aluguel novo', valor: 210000, data: '2026-10-31', pagador: 'B' });
    // Novembro: o valor foi mudado à mão e fica; o resto acompanha.
    expect(despesaPorId(e, idOcorrencia(id, '2026-11'))).toMatchObject({ descricao: 'Aluguel novo', valor: 205000, data: '2026-11-30', pagador: 'B' });
    expect(feed(ana)).toContain('Ana alterou a recorrente Aluguel (agora Aluguel novo)');
  });

  it('sem "atualizar as já lançadas", muda só a recorrente', () => {
    const { ana, id } = cenario();
    const eventos = ana.fazer((e, ctx) => editarRecorrente(e, id, aluguel(e, { valor: 210000 }), false, ctx));
    expect(eventos.map((ev) => ev.entidade)).toEqual(['recorrente']);
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-10'))?.valor).toBe(200000);
  });

  it('início mais cedo gera os meses que faltam; período menor exclui as que ficam de fora', () => {
    const { ana, id } = cenario();
    ana.fazer((e, ctx) => editarRecorrente(e, id, aluguel(e, { inicio: '2026-08', fim: '2026-10' }), true, ctx));
    const vivas = ana.estado().despesas.filter((d) => !d.excluida).map((d) => d.competencia).sort();
    expect(vivas).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(feed(ana)).toContain('Ana alterou a recorrente Aluguel');
    expect(feed(ana).some((t) => t.startsWith('Ana encerrou'))).toBe(false);
    // "Encerrar" continua aparecendo como encerramento.
    ana.fazer((e, ctx) => encerrarRecorrente(e, id, '2026-09', ctx));
    expect(feed(ana)).toContain('Ana encerrou a recorrente Aluguel em setembro de 2026');
  });

  it('de variável para fixo: as que aguardavam valor recebem o valor', () => {
    const ana = novaCasa('2026-11-10');
    ana.fazer((e, ctx) => criarRecorrente(e, aluguel(e, { tipoValor: 'variavel', valor: 0, inicio: '2026-10' }), ctx));
    const id = ana.estado().recorrentes[0]?.id ?? '';
    ana.fazer((e, ctx) => alterarDespesa(e, idOcorrencia(id, '2026-10'), { valor: 9000 }, ctx));
    ana.fazer((e, ctx) => editarRecorrente(e, id, aluguel(e, { valor: 10000, inicio: '2026-10' }), true, ctx));
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-10'))).toMatchObject({ valor: 9000, status: 'normal' });
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-11'))).toMatchObject({ valor: 10000, status: 'normal' });
    // De fixo para variável: o que já foi lançado fica.
    ana.fazer((e, ctx) => editarRecorrente(e, id, aluguel(e, { tipoValor: 'variavel', valor: 0, inicio: '2026-10' }), true, ctx));
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-11'))).toMatchObject({ valor: 10000, status: 'normal' });
  });

  it('divisão: % próprio, depois volta a seguir a categoria (inclusive a nova)', () => {
    const { ana, id } = cenario();
    ana.fazer((e, ctx) => editarRecorrente(e, id, aluguel(e, { pctA: 5000 }), true, ctx));
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-10'))).toMatchObject({ pctA: 5000, pctPadrao: false });
    const carro = idCategoria(ana.estado(), 'Carro'); // 50/50 → volta ao padrão, mas a categoria nova é 50%
    ana.fazer((e, ctx) => editarRecorrente(e, id, aluguel(e, { categoriaId: carro }), true, ctx));
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-10'))).toMatchObject({ categoriaId: carro, pctA: 5000, pctPadrao: true });
    const casa = idCategoria(ana.estado(), 'Despesas da Casa'); // 60%
    ana.fazer((e, ctx) => editarRecorrente(e, id, aluguel(e, { categoriaId: casa }), true, ctx));
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-10'))).toMatchObject({ categoriaId: casa, pctA: 6000, pctPadrao: true });
    // Setembro (acertado) nunca muda.
    expect(despesaPorId(ana.estado(), idOcorrencia(id, '2026-09'))).toMatchObject({ pctA: 6000, categoriaId: idCategoria(ana.estado(), 'Moradia') });
  });

  it('recusa dados inválidos e recorrente inexistente', () => {
    const { ana, id } = cenario();
    expect(editarRecorrente(ana.estado(), id, aluguel(ana.estado(), { dia: 0 }), true, ana.ctx)).toMatchObject({
      ok: false,
      mensagem: 'Informe o dia do vencimento (de 1 a 31).',
    });
    expect(editarRecorrente(ana.estado(), 'x', aluguel(ana.estado()), true, ana.ctx).ok).toBe(false);
  });
});

describe('editar parcelamento', () => {
  function sofa(estado: Estado, extra: Partial<DadosParcelamento> = {}): DadosParcelamento {
    return {
      descricao: 'Sofá', categoriaId: idCategoria(estado, 'Compras'), pagador: 'A', pctA: 5000, pctPadrao: true,
      n: 5, valorTotal: 225000, dataCompra: '2026-10-10', primeiraCompetencia: '2026-10', ...extra,
    };
  }

  /** Sofá 5x de R$ 450 (out/26 a fev/27), com outubro já acertado. */
  function cenario(fecharOutubro = true) {
    const ana = novaCasa('2026-11-10');
    ana.fazer((e, ctx) => criarParcelamento(e, sofa(e), ctx)); // 225000 em 5x = 45000 cada
    if (fecharOutubro) ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-10', ctx));
    const id = ana.estado().parcelamentos[0]?.id ?? '';
    const valores = () => parcelasDe(ana.estado(), id).map((d) => d.valor);
    return { ana, id, valores };
  }

  it('sem mudança, não gera nada', () => {
    const { ana, id } = cenario();
    expect(ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e), ctx))).toEqual([]);
  });

  it('descrição, categoria, quem pagou e divisão valem para as parcelas abertas; o feed mostra uma linha', () => {
    const { ana, id } = cenario();
    const carro = idCategoria(ana.estado(), 'Carro');
    ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e, { descricao: 'Sofá novo', categoriaId: carro, pagador: 'B', pctA: 6000, pctPadrao: false }), ctx));
    const [primeira, ...resto] = parcelasDe(ana.estado(), id);
    expect(primeira).toMatchObject({ descricao: 'Sofá', pagador: 'A', pctA: 5000 });
    expect(resto.every((d) => d.descricao === 'Sofá novo' && d.categoriaId === carro && d.pagador === 'B' && d.pctA === 6000 && !d.pctPadrao)).toBe(true);
    expect(ana.estado().parcelamentos[0]).toMatchObject({ descricao: 'Sofá novo', pctA: 6000 });
    const textos = feed(ana);
    expect(textos.filter((t) => t.includes('Sofá novo'))).toEqual(['Ana alterou o parcelamento Sofá novo']);
    // A linha do tempo de cada parcela mostra o detalhe.
    const p2 = idParcela(id, 2);
    const linha = gerarAtividade(ana.eventos.filter((ev) => ev.entidadeId === p2), ana.estado().config, true).flatMap((i) => i.textos);
    expect(linha).toContain('Ana renomeou Sofá para Sofá novo');
  });

  it('novo total: o que falta é dividido entre as parcelas abertas', () => {
    const { ana, id, valores } = cenario();
    ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e, { valorTotal: 200001 }), ctx));
    expect(valores()).toEqual([45000, 38751, 38750, 38750, 38750]);
    expect(ana.estado().parcelamentos[0]?.valorTotal).toBe(200001);
    expect(feed(ana)).toContain(`Ana alterou o parcelamento Sofá: agora 5x, total ${formatarReais(200001)}`);
  });

  it('pelo valor da parcela: cada parcela aberta passa a ter esse valor', () => {
    const { ana, id, valores } = cenario();
    ana.fazer((e, ctx) => {
      const { valorTotal: _sem, ...d } = sofa(e);
      return editarParcelamento(e, id, { ...d, valorParcela: 50000 }, ctx);
    });
    expect(valores()).toEqual([45000, 50000, 50000, 50000, 50000]);
    expect(ana.estado().parcelamentos[0]?.valorTotal).toBe(245000);
  });

  it('mais parcelas: cria as novas nos meses seguintes e atualiza o "k/n" das abertas', () => {
    const { ana, id, valores } = cenario();
    ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e, { n: 7 }), ctx));
    expect(valores()).toEqual([45000, 30000, 30000, 30000, 30000, 30000, 30000]);
    const parcelas = parcelasDe(ana.estado(), id);
    expect(parcelas.map((d) => (d.origem.tipo === 'parcela' ? d.origem.n : 0))).toEqual([5, 7, 7, 7, 7, 7, 7]);
    expect(parcelas.at(-1)).toMatchObject({ competencia: '2027-04', data: '2027-04-10', descricao: 'Sofá' });
  });

  it('menos parcelas: exclui as que sobram', () => {
    const { ana, id, valores } = cenario();
    ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e, { n: 3 }), ctx));
    expect(valores()).toEqual([45000, 90000, 90000]);
    expect(feed(ana).some((t) => t.startsWith('Ana excluiu'))).toBe(false);
  });

  it('nova data da compra e novo mês da 1ª parcela (sem nada acertado)', () => {
    const { ana, id } = cenario(false);
    ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e, { dataCompra: '2026-10-31', primeiraCompetencia: '2026-11' }), ctx));
    expect(parcelasDe(ana.estado(), id).map((d) => d.data)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('volta a criar uma parcela excluída quando os valores são refeitos', () => {
    const { ana, id, valores } = cenario();
    ana.fazer((e, ctx) => excluirDespesa(e, idParcela(id, 3), ctx));
    ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e, { descricao: 'Sofá azul' }), ctx));
    expect(valores()).toHaveLength(4); // só descrição: não ressuscita
    ana.fazer((e, ctx) => editarParcelamento(e, id, sofa(e, { descricao: 'Sofá azul', valorTotal: 205000 }), ctx));
    expect(valores()).toEqual([45000, 40000, 40000, 40000, 40000]);
    expect(despesaPorId(ana.estado(), idParcela(id, 3))).toMatchObject({ excluida: false, descricao: 'Sofá azul' });
  });

  it('recusa o que mexeria em mês acertado', () => {
    const { ana, id } = cenario();
    const e = ana.estado();
    expect(editarParcelamento(e, id, sofa(e, { primeiraCompetencia: '2026-11' }), ana.ctx)).toMatchObject({ ok: false });
    expect(editarParcelamento(e, id, sofa(e, { valorTotal: 45003 }), ana.ctx)).toMatchObject({
      ok: false,
      mensagem: `O total precisa ser maior que o que já foi acertado (${formatarReais(45000)}).`,
    });
    ana.fazer((x, ctx) => fecharMes(x, LIVRO_CASA, '2026-11', ctx));
    ana.fazer((x, ctx) => fecharMes(x, LIVRO_CASA, '2026-12', ctx));
    expect(editarParcelamento(ana.estado(), id, sofa(ana.estado(), { n: 2 }), ana.ctx)).toMatchObject({
      ok: false,
      mensagem: 'Já há parcelas em meses acertados: o parcelamento precisa ter pelo menos 3 parcelas.',
    });
    ana.fazer((x, ctx) => fecharMes(x, LIVRO_CASA, '2027-04', ctx));
    expect(editarParcelamento(ana.estado(), id, sofa(ana.estado(), { n: 7 }), ana.ctx)).toMatchObject({
      ok: false,
      mensagem: 'A parcela 7/7 cairia em abril de 2027, que já foi acertado.',
    });
  });

  it('mudar o mês quando ele cairia num mês acertado é recusado', () => {
    const { ana, id } = cenario(false);
    ana.fazer((x, ctx) => fecharMes(x, LIVRO_CASA, '2027-03', ctx));
    expect(editarParcelamento(ana.estado(), id, sofa(ana.estado(), { primeiraCompetencia: '2026-11' }), ana.ctx)).toMatchObject({
      ok: false,
      mensagem: 'A parcela 5/5 cairia em março de 2027, que já foi acertado.',
    });
  });

  it('todas acertadas: o total não pode mudar', () => {
    const { ana, id } = cenario();
    for (const c of ['2026-11', '2026-12', '2027-01', '2027-02']) ana.fazer((x, ctx) => fecharMes(x, LIVRO_CASA, c, ctx));
    expect(editarParcelamento(ana.estado(), id, sofa(ana.estado(), { valorTotal: 230000 }), ana.ctx)).toMatchObject({ ok: false });
    // A descrição muda só no parcelamento.
    const eventos = ana.fazer((x, ctx) => editarParcelamento(x, id, sofa(x, { descricao: 'Sofá velho' }), ctx));
    expect(eventos.map((ev) => ev.entidade)).toEqual(['parcelamento']);
  });

  it('cancelado: só descrição, categoria, quem pagou e divisão', () => {
    const { ana, id } = cenario();
    ana.fazer((x, ctx) => cancelarParcelasRestantes(x, id, '2027-01', ctx));
    expect(editarParcelamento(ana.estado(), id, sofa(ana.estado(), { n: 6 }), ana.ctx)).toMatchObject({ ok: false });
    ana.fazer((x, ctx) => editarParcelamento(x, id, sofa(x, { pagador: 'B' }), ctx));
    expect(parcelasDe(ana.estado(), id).map((d) => d.pagador)).toEqual(['A', 'B', 'B']);
  });

  it('recusa dados inválidos e parcelamento inexistente', () => {
    const { ana, id } = cenario();
    const e = ana.estado();
    expect(editarParcelamento(e, 'x', sofa(e), ana.ctx).ok).toBe(false);
    expect(editarParcelamento(e, id, sofa(e, { descricao: ' ' }), ana.ctx).ok).toBe(false);
    const { valorTotal: _sem, ...semValor } = sofa(e);
    expect(editarParcelamento(e, id, semValor, ana.ctx).ok).toBe(false);
    expect(editarParcelamento(e, id, { ...semValor, valorParcela: 0 }, ana.ctx).ok).toBe(false);
    expect(editarParcelamento(e, id, sofa(e, { valorTotal: VALOR_MAXIMO + 1 }), ana.ctx).ok).toBe(false);
  });
});
