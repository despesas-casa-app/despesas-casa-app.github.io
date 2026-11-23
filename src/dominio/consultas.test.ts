import { describe, expect, it } from 'vitest';
import { alterarCategoria, arquivarCategoria } from './categorias.ts';
import { definirNomes } from './config.ts';
import { alterarDespesa, criarDespesa, excluirDespesa, type DadosDespesa } from './despesas.ts';
import { gerarAtividade } from './atividade.ts';
import { type Estado } from './estado.ts';
import { fecharMes, reabrirMes } from './fechamento.ts';
import { cancelarParcelasRestantes, criarParcelamento } from './parcelamentos.ts';
import { criarRecorrente, encerrarRecorrente, excluirRecorrente, pausarRecorrente } from './recorrentes.ts';
import { gastoPorCategoria, totaisPorMes } from './relatorios.ts';
import { fraseDoSaldo, transferenciaDoSaldo } from './saldo.ts';
import { categoriasMaisUsadas, normalizarTexto, sugerir } from './sugestoes.ts';
import { LIVRO_CASA } from './tipos.ts';
import { AparelhoDeTeste, idCategoria, iniciarCasa } from './testes/aparelho.ts';

function novaCasa(hoje = '2026-11-10') {
  const ana = new AparelhoDeTeste('celAna', 'A', hoje);
  iniciarCasa(ana);
  return ana;
}

function lancar(ana: AparelhoDeTeste, d: Partial<DadosDespesa> & { cat?: string } = {}): string {
  return (
    ana.fazer((e: Estado, ctx) => {
      const { cat, ...resto } = d;
      return criarDespesa(e, {
        valor: 1000, descricao: 'Mercado', data: '2026-11-08', competencia: '2026-11',
        categoriaId: idCategoria(e, cat ?? 'Despesas da Casa'), pagador: 'A', pctA: 6000, pctPadrao: true, ...resto,
      }, ctx);
    })[0]?.entidadeId ?? ''
  );
}

describe('saldo', () => {
  it('frase natural e transferência', () => {
    const config = { nomeA: 'Ana', nomeB: 'Bruno', emailA: '', emailB: '', moeda: 'BRL' as const };
    expect(transferenciaDoSaldo(0)).toBeNull();
    expect(transferenciaDoSaldo(-500)).toEqual({ de: 'A', para: 'B', valor: 500 });
    expect(fraseDoSaldo(null, config)).toBe('Ninguém deve nada');
    expect(fraseDoSaldo({ de: 'A', para: 'B', valor: 34210 }, config)).toBe('Ana deve R$ 342,10 para Bruno');
  });
});

describe('sugestões', () => {
  it('normaliza texto', () => {
    expect(normalizarTexto('  Açaí  da   ESQUINA! ')).toBe('acai da esquina');
  });

  it('sugere pelo começo das palavras, com categoria, pagador e % mais frequentes', () => {
    const ana = novaCasa();
    lancar(ana, { descricao: 'Padaria', pagador: 'B', cat: 'Despesas da Casa', data: '2026-11-01' });
    lancar(ana, { descricao: 'padaria', pagador: 'B', cat: 'Despesas da Casa', data: '2026-11-02' });
    lancar(ana, { descricao: 'Padaria', pagador: 'A', cat: 'Outros', pctA: 5000, pctPadrao: false, data: '2026-11-03' });
    lancar(ana, { descricao: 'Pão de queijo', cat: 'Outros' });
    lancar(ana, { descricao: 'Uber pro aeroporto', cat: 'Transporte' });
    const excl = lancar(ana, { descricao: 'Padaria Nova' });
    ana.fazer((e, ctx) => excluirDespesa(e, excl, ctx));

    const [primeira, segunda] = sugerir(ana.estado(), 'pa');
    expect(primeira).toMatchObject({ descricao: 'Padaria', pagador: 'B', vezes: 3, pctA: 6000, pctPadrao: true });
    expect(primeira?.categoriaId).toBe(idCategoria(ana.estado(), 'Despesas da Casa'));
    expect(segunda?.descricao).toBe('Pão de queijo');
    expect(sugerir(ana.estado(), 'aero').map((s) => s.descricao)).toEqual(['Uber pro aeroporto']);
    expect(sugerir(ana.estado(), 'xyz')).toEqual([]);
    expect(sugerir(ana.estado(), '', 2)).toHaveLength(2);
    // Empate em 2 usos: ganha a usada mais recentemente (Outros, em 08/11).
    expect(categoriasMaisUsadas(ana.estado()).slice(0, 2)).toEqual([
      idCategoria(ana.estado(), 'Outros'),
      idCategoria(ana.estado(), 'Despesas da Casa'),
    ]);
  });

  it('parcelas e recorrentes não contam para as sugestões', () => {
    const ana = novaCasa();
    lancar(ana, { descricao: 'Mercado', cat: 'Despesas da Casa' });
    ana.fazer((e, ctx) =>
      criarParcelamento(e, {
        descricao: 'Sofá', categoriaId: idCategoria(e, 'Compras'), pagador: 'A', pctA: 5000, pctPadrao: true,
        n: 10, valorParcela: 100, dataCompra: '2026-11-01', primeiraCompetencia: '2026-11',
      }, ctx),
    );
    expect(sugerir(ana.estado(), '').map((s) => s.descricao)).toEqual(['Mercado']);
    expect(categoriasMaisUsadas(ana.estado())).toEqual([idCategoria(ana.estado(), 'Despesas da Casa')]);
  });

  it('não sugere categoria arquivada e ignora descrição vazia', () => {
    const ana = novaCasa();
    lancar(ana, { descricao: 'Gasolina', cat: 'Carro' });
    lancar(ana, { descricao: 'Gasolina', cat: 'Carro', data: '2026-11-01' });
    ana.eventos.push({ ...ana.eventos.at(-1)!, id: 'vazio', entidadeId: 'vazio', campos: { ...ana.eventos.at(-1)!.campos, descricao: '!!!' } });
    expect(sugerir(ana.estado(), 'gas')).toHaveLength(1);
    ana.fazer((e, ctx) => arquivarCategoria(e, idCategoria(e, 'Carro'), true, ctx));
    expect(sugerir(ana.estado(), 'gas')).toEqual([]);
  });
});

describe('relatórios', () => {
  it('gasto por categoria e comparação entre meses', () => {
    const ana = novaCasa();
    lancar(ana, { valor: 3000, cat: 'Outros' });
    lancar(ana, { valor: 5000 });
    lancar(ana, { valor: 1000 });
    lancar(ana, { valor: 700, data: '2026-10-08', competencia: '2026-10', pagador: 'B' });
    const porCat = gastoPorCategoria(ana.estado(), LIVRO_CASA, '2026-11');
    expect(porCat.map((g) => [g.categoria?.nome, g.total])).toEqual([['Despesas da Casa', 6000], ['Outros', 3000]]);
    const meses = totaisPorMes(ana.estado(), LIVRO_CASA, '2026-11', 3);
    expect(meses.map((m) => [m.competencia, m.total, m.pagoPor.B])).toEqual([
      ['2026-09', 0, 0], ['2026-10', 700, 700], ['2026-11', 9000, 0],
    ]);
  });
});

describe('atividade', () => {
  it('descreve as ações em linguagem natural, da mais recente para a mais antiga', () => {
    const ana = novaCasa('2026-10-01');
    const bruno = new AparelhoDeTeste('celBruno', 'B', '2026-10-01');
    const id = lancar(ana, { valor: 12000, data: '2026-10-01', competencia: '2026-10' });
    bruno.receberDe(ana);
    bruno.avancarMinutos(1);
    bruno.fazer((e, ctx) =>
      alterarDespesa(e, id, {
        valor: 15000, descricao: 'Supermercado', categoriaId: idCategoria(e, 'Outros'), pagador: 'B',
        pctA: 5000, data: '2026-10-02',
      }, ctx),
    );
    bruno.fazer((e, ctx) => alterarDespesa(e, id, { competencia: '2026-11' }, ctx));
    bruno.fazer((e, ctx) => excluirDespesa(e, id, ctx));
    const cat = idCategoria(bruno.estado(), 'Moradia');
    bruno.fazer((e, ctx) => alterarCategoria(e, cat, { nome: 'Casa', icone: '🏠', cor: '#000', pctA: 5500 }, false, ctx));
    bruno.fazer((e, ctx) => arquivarCategoria(e, cat, true, ctx));
    bruno.fazer((e, ctx) => arquivarCategoria(e, cat, false, ctx));
    bruno.fazer((e, ctx) => definirNomes(e, 'Ana', 'Beto', ctx));

    const textos = gerarAtividade(bruno.eventos, bruno.estado().config).flatMap((i) => i.textos);
    expect(textos).toEqual([
      'Beto alterou os nomes para Ana e Beto',
      'Beto reativou a categoria Casa',
      'Beto arquivou a categoria Casa',
      'Beto renomeou a categoria Moradia para Casa',
      'Beto alterou a divisão de Casa: 60% → 55%',
      'Beto excluiu Supermercado (R$ 150,00)',
      'Beto moveu Supermercado para novembro de 2026',
      'Beto alterou Supermercado: R$ 120,00 → R$ 150,00',
      'Beto renomeou Mercado para Supermercado',
      'Beto mudou a data de Supermercado: 01/10/2026 → 02/10/2026',
      'Beto mudou a categoria de Supermercado: Despesas da Casa → Outros',
      'Beto mudou quem pagou Supermercado: Ana → Beto',
      'Beto mudou a divisão de Supermercado: 60% → 50%',
      'Ana lançou Mercado: R$ 120,00',
      ...Array.from({ length: 13 }, () => expect.stringMatching(/^Ana criou a categoria /) as unknown as string),
    ]);
  });

  it('recorrentes, parcelamentos e fechamentos', () => {
    const ana = novaCasa('2026-11-05');
    ana.fazer((e, ctx) =>
      criarRecorrente(e, {
        descricao: 'Luz', categoriaId: idCategoria(e, 'Contas de Consumo'), pagador: 'A', tipoValor: 'variavel',
        valor: 0, dia: 5, inicio: '2026-11', fim: null, pctA: null,
      }, ctx),
    );
    ana.fazer((e, ctx) =>
      criarRecorrente(e, {
        descricao: 'Aluguel', categoriaId: idCategoria(e, 'Moradia'), pagador: 'A', tipoValor: 'fixo',
        valor: 250000, dia: 5, inicio: '2026-11', fim: null, pctA: null,
      }, ctx),
    );
    const [luz, aluguel] = ana.estado().recorrentes.map((r) => r.id);
    const ocorrenciaLuz = ana.estado().despesas.find((d) => d.descricao === 'Luz')?.id ?? '';
    ana.fazer((e, ctx) => alterarDespesa(e, ocorrenciaLuz, { valor: 18990 }, ctx));
    ana.fazer((e, ctx) => pausarRecorrente(e, luz ?? '', true, ctx));
    ana.fazer((e, ctx) => pausarRecorrente(e, luz ?? '', false, ctx));
    ana.fazer((e, ctx) => encerrarRecorrente(e, aluguel ?? '', '2026-12', ctx));
    ana.fazer((e, ctx) => excluirRecorrente(e, luz ?? '', ctx));
    ana.fazer((e, ctx) =>
      criarParcelamento(e, {
        descricao: 'Sofá', categoriaId: idCategoria(e, 'Compras'), pagador: 'B', pctA: 5000, pctPadrao: true,
        n: 10, valorParcela: 45000, dataCompra: '2026-11-05', primeiraCompetencia: '2026-11',
      }, ctx),
    );
    const sofa = ana.estado().parcelamentos[0]?.id ?? '';
    ana.fazer((e, ctx) => cancelarParcelasRestantes(e, sofa, '2027-06', ctx));
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    ana.fazer((e, ctx) => reabrirMes(e, LIVRO_CASA, '2026-11', ctx));
    ana.fazer((e, ctx) => excluirDespesa(e, ocorrenciaLuz, ctx));
    ana.fazer((e, ctx) => excluirDespesa(e, ana.estado().despesas.find((d) => d.descricao === 'Sofá' && !d.excluida)?.id ?? '', ctx));
    ana.fazer((e, ctx) => excluirDespesa(e, ana.estado().despesas.find((d) => d.descricao === 'Aluguel')?.id ?? '', ctx));
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    ana.mudarDia('2026-12-01');
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-12', ctx));

    const textos = gerarAtividade(ana.eventos, ana.estado().config).flatMap((i) => i.textos);
    expect(textos.slice(0, 14)).toEqual([
      // Em dezembro sobra a parcela 2 do sofá (paga por Bruno, 50/50).
      'Ana acertou dezembro de 2026: Ana transfere R$ 225,00 para Bruno',
      'Ana acertou novembro de 2026: ninguém devia nada',
      'Ana excluiu Aluguel (R$ 2.500,00)',
      'Ana excluiu Sofá (R$ 450,00)',
      'Ana excluiu Luz (R$ 189,90)',
      'Ana reabriu novembro de 2026',
      expect.stringMatching(/^Ana acertou novembro de 2026: Bruno transfere R\$\u00a0[\d.,]+ para Ana$/) as unknown as string,
      'Ana cancelou as parcelas restantes de Sofá',
      'Ana lançou Sofá em 10x (total R$ 4.500,00)',
      'Ana excluiu a recorrente Luz',
      'Ana encerrou a recorrente Aluguel em dezembro de 2026',
      'Ana retomou a recorrente Luz',
      'Ana pausou a recorrente Luz',
      'Ana informou o valor de Luz: R$ 189,90',
    ]);
    expect(textos).toContain('Aluguel de novembro de 2026 foi gerada automaticamente: R$ 2.500,00');
    expect(textos).toContain('Luz de novembro de 2026 foi gerada e aguarda o valor');
    expect(textos).toContain('Ana criou a recorrente Aluguel');
  });

  it('ignora eventos repetidos, alterações órfãs e mudanças sem efeito', () => {
    const ana = novaCasa();
    const id = lancar(ana);
    const [ev] = ana.fazer((e, ctx) => alterarDespesa(e, id, { valor: 2000 }, ctx));
    const extras = [
      { ...ev!, id: 'orfa', entidadeId: 'nao-existe' },
      { ...ana.eventos[0]!, id: 'repetida' },
      { ...ev!, id: 'sem-efeito', hlc: `${ev!.hlc}z`, campos: { valor: 2000, livro: 'casa' } },
      { ...ev!, id: 'outra-coisa', hlc: `${ev!.hlc}zz`, campos: { observacao: 'x' } },
      { ...ev!, id: 'rec-sem-campos', hlc: `${ev!.hlc}zzz`, entidade: 'recorrente' as const, entidadeId: 'r', tipo: 'criar' as const, campos: { descricao: 'R' } },
      { ...ev!, id: 'rec-alt', hlc: `${ev!.hlc}zzzz`, entidade: 'recorrente' as const, entidadeId: 'r', campos: { dia: 3 } },
      { ...ev!, id: 'parc', hlc: `${ev!.hlc}zzzzz`, entidade: 'parcelamento' as const, entidadeId: 'p', tipo: 'criar' as const, campos: { descricao: 'P', n: 2 } },
      { ...ev!, id: 'parc-alt', hlc: `${ev!.hlc}zzzzzz`, entidade: 'parcelamento' as const, entidadeId: 'p', campos: { pagador: 'B' } },
      { ...ev!, id: 'cat-alt', hlc: `${ev!.hlc}zzzzzzz`, entidade: 'categoria' as const, entidadeId: ana.estado().categorias[0]!.id, campos: { cor: '#fff' } },
    ];
    const itens = gerarAtividade([...ana.eventos, ...extras], ana.estado().config);
    const textos = itens.flatMap((i) => i.textos);
    expect(textos.filter((t) => t.includes('alterou Mercado'))).toHaveLength(1);
    expect(textos).toContain('Ana alterou a recorrente R');
    expect(textos).toContain('Ana alterou o parcelamento P');
    expect(itens[0]?.instante).toBeGreaterThan(0);
  });
});
