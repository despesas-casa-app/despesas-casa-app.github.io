import { describe, expect, it } from 'vitest';
import { gerarAtividade } from './atividade.ts';
import { novoEvento } from './contexto.ts';
import { camposNovaDespesa } from './despesas.ts';
import type { Estado } from './estado.ts';
import { fechamentoDe, mesFechado } from './estado.ts';
import type { Evento } from './eventos.ts';
import { divergenciasDeFechamento, fecharMes, reabrirMes } from './fechamento.ts';
import {
  analisarTricount,
  ErroImportacao,
  gerarEventosImportacao,
  lerDataTricount,
  lerValorTricount,
  mudancasDoPlano,
  planejarImportacao,
  sugerirCategorias,
  type AnaliseTricount,
  type DespesaPlanejada,
  type OpcoesImportacao,
  type PlanoImportacao,
} from './importacaoTricount.ts';
import { resumirMes } from './saldo.ts';
import { sugerir } from './sugestoes.ts';
import { AparelhoDeTeste, idCategoria, iniciarCasa } from './testes/aparelho.ts';
import { LIVRO_CASA } from './tipos.ts';

// Arquivo FICTÍCIO no formato da exportação do Tricount (pessoas e valores inventados).
const CABECALHO =
  '"Título","Valor","Moeda","Taxa de câmbio","Valor na moeda padrão (BRL)","Tipo de transação","Categoria",' +
  '"Pago por","Pago por Ana","Pago por Bruno","Impactado para Ana","Impactado para Bruno","Data e hora","URL do Anexo"';

function linha(
  titulo: string, valor: string, tipo: string, categoria: string, pagoPor: string,
  pagoAna: string, pagoBruno: string, impAna: string, impBruno: string, data: string,
): string {
  return [titulo, valor, 'BRL', '1', valor, tipo, categoria, pagoPor, pagoAna, pagoBruno, impAna, impBruno, data, '']
    .map((c) => `"${c.replaceAll('"', '""')}"`)
    .join(',');
}

const LINHAS = [
  // setembro: mercado 100 pago pela Ana, 60/40
  linha('Mercado', '100.00', 'Despesa', 'Supermercado', 'Ana', '100.00', '0', '-60.00', '-40.00', '05 de setembro de 2026 10:00'),
  // setembro: aluguel 1000 pago pelo Bruno, 50/50
  linha('Aluguel', '1000', 'Despesa', 'Aluguel e Cobranças', 'Bruno', '0', '1000', '-500.00', '-500.00', '10 de setembro de 2026 09:00'),
  // outubro: jantar 90 pago pelos dois, 50/50 (Ana 30, Bruno 60)
  linha('Jantar, "especial"', '90.00', 'Despesa', 'Restaurantes e Bares', 'Ana e Bruno', '30.00', '60.00', '-45.00', '-45.00', '3 de outubro de 2026 21:15'),
  // novembro (mês corrente): farmácia 33.33 paga pela Ana, tudo do Bruno
  linha('Farmácia', '33.33', 'Despesa', 'Saúde', 'Ana', '33.33', '0', '0', '-33.33', '2 de novembro de 2026 12:00'),
  // acerto no meio do mês: Ana transfere 441.17 para o Bruno (sobram 0,50 de arredondamento)
  linha('Acerto', '441.17', 'Transferência de dinheiro', '', 'Ana', '441.17', '0', '0', '-441.17', '3 de novembro de 2026 08:00'),
  // depois do acerto: reembolso (valor negativo, entra só no saldo) e padaria paga pelo Bruno
  linha('Devolução', '-10.00', 'Despesa', 'Shopping', 'Ana', '-10.00', '0', '5.00', '5.00', '4 de novembro de 2026 12:00'),
  linha('Padaria', '20.00', 'Despesa', 'Supermercado', 'Bruno', '0', '20.00', '-10.00', '-10.00', '5 de novembro de 2026 07:30'),
  // rodapé do Tricount
  '"Total","","","","1234.50","","","","","","","","",""',
  '"Exportado pelo Tricount","","","","","","","","","","","","",""',
];

const CSV = '﻿' + [CABECALHO, ...LINHAS].join('\r\n') + '\r\n';
/** O mesmo arquivo na ordem em que o Tricount exporta (do mais novo para o mais antigo). */
const CSV_DO_MAIS_NOVO = [CABECALHO, ...LINHAS.slice(0, 7).reverse(), ...LINHAS.slice(7)].join('\r\n');

function novaCasa(): AparelhoDeTeste {
  const ana = new AparelhoDeTeste('celAna', 'A', '2026-11-15');
  iniciarCasa(ana);
  return ana;
}

function opcoes(estado: Estado, analise: AnaliseTricount): OpcoesImportacao {
  return {
    pessoaDe: { Ana: 'A', Bruno: 'B' },
    categoriaDe: Object.fromEntries(sugerirCategorias(analise.categorias.keys(), estado.categorias)),
    mesCorrente: '2026-11',
    hoje: '2026-11-15',
  };
}

function importar(ana: AparelhoDeTeste, csv = CSV): PlanoImportacao {
  const analise = analisarTricount(csv);
  const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
  ana.aplicar(gerarEventosImportacao(plano, ana.estado(), ana.ctx));
  return plano;
}

function novembro(estado: Estado): ReturnType<typeof resumirMes> {
  return resumirMes('2026-11', estado.despesas.filter((d) => d.competencia === '2026-11' && !d.excluida));
}

/** Saldo do Tricount calculado à mão a partir do arquivo fictício (positivo: Ana tem a receber). */
// Mercado: +100 −60 = +40 · Aluguel: −500 · Jantar: +30 −45 = −15 · Farmácia: +33,33 → −441,67
// Acerto: Ana pagou 441,17 → −0,50 (resto de arredondamento) · Devolução: −10 − (−5) = −5 · Padaria: −10
const SALDO_TRICOUNT_A = 4000 - 50000 - 1500 + 3333 + 44117 - 500 - 1000;
const RESIDUO_A = -50;

describe('leitura dos valores e datas do Tricount', () => {
  it('lê valores com ponto decimal sem erro de arredondamento', () => {
    expect(lerValorTricount('1234.56')).toBe(123456);
    expect(lerValorTricount('-99.9')).toBe(-9990);
    expect(lerValorTricount('0')).toBe(0);
    expect(lerValorTricount('0.07')).toBe(7);
    expect(lerValorTricount(' 12 ')).toBe(1200);
    expect(lerValorTricount('12,5')).toBe(1250);
    expect(lerValorTricount('abc')).toBeNull();
    expect(lerValorTricount('1.234.56')).toBeNull();
  });

  it('lê datas por extenso, com e sem acento', () => {
    expect(lerDataTricount('21 de novembro de 2024 14:35')).toBe('2024-11-21');
    expect(lerDataTricount('3 de março de 2025 08:00')).toBe('2025-03-03');
    expect(lerDataTricount('3 de Marco de 2025')).toBe('2025-03-03');
    expect(lerDataTricount('31 de fevereiro de 2025 10:00')).toBeNull();
    expect(lerDataTricount('ontem')).toBeNull();
    expect(lerDataTricount('5 de brumário de 2025')).toBeNull();
  });
});

describe('análise do arquivo', () => {
  it('reconhece pessoas, despesas, transferências e pula o rodapé', () => {
    const a = analisarTricount(CSV);
    expect(a.pessoas).toEqual(['Ana', 'Bruno']);
    expect(a.linhas.filter((l) => l.tipo === 'despesa')).toHaveLength(6);
    expect(a.linhas.filter((l) => l.tipo === 'transferencia')).toHaveLength(1);
    expect(a.ignoradas.map((i) => i.numero)).toEqual([9, 10]);
    const jantar = a.linhas.find((l) => l.titulo === 'Jantar, "especial"');
    expect(jantar?.pagos.get('Bruno')).toBe(6000);
    expect(jantar?.partes.get('Ana')).toBe(4500);
    expect(a.categorias.get('Supermercado')).toBe(2);
    expect(a.categorias.has('Sem categoria')).toBe(false);
  });

  it('linha com valor ou data estranhos é ignorada com motivo', () => {
    const csv = [CABECALHO, linha('X', 'muito', 'Despesa', '', 'Ana', '1', '0', '-1', '0', '1 de maio de 2026')].join('\n');
    const a = analisarTricount(csv);
    expect(a.linhas).toHaveLength(0);
    expect(a.ignoradas[0]?.motivo).toContain('formato');
  });

  it('despesa sem categoria ou sem título recebe um nome padrão', () => {
    const csv = [CABECALHO, linha('', '10', 'Despesa', '', 'Ana', '10', '0', '-5', '-5', '1 de maio de 2026')].join('\n');
    const a = analisarTricount(csv);
    expect(a.linhas[0]?.titulo).toBe('Sem título');
    expect(a.categorias.get('Sem categoria')).toBe(1);
  });

  it('recusa arquivos que não são do Tricount', () => {
    expect(() => analisarTricount('Data;Valor\n01/01/2026;10')).toThrow(ErroImportacao);
    expect(() => analisarTricount('')).toThrow(ErroImportacao);
  });

  it('recusa grupos com mais (ou menos) de 2 pessoas', () => {
    const tres = CABECALHO.replace('"Impactado para Ana"', '"Pago por Caio","Impactado para Ana","Impactado para Caio"');
    expect(() => analisarTricount(tres)).toThrow(/2 pessoas.*3/);
    const uma = '"Título","Valor na moeda padrão (BRL)","Tipo de transação","Data e hora","Pago por Ana","Impactado para Ana"';
    expect(() => analisarTricount(uma)).toThrow(/tem 1/);
  });
});

describe('sugestão de categorias', () => {
  it('liga as categorias comuns do Tricount às do app', () => {
    const estado = novaCasa().estado();
    const nomes = [
      'Supermercado', 'Aluguel e Cobranças', 'Restaurantes e Bares', 'Shopping', 'Transport',
      'Viagem ✈️', 'Contas de  Consumo 🏠', 'Carrinho 🚗', 'Gatinhos 🐱', 'Seguro', 'Saúde', 'Sem categoria', 'Outro',
    ];
    const s = sugerirCategorias(nomes, estado.categorias);
    const nome = (t: string): string | undefined => estado.categorias.find((c) => c.id === s.get(t))?.nome;
    expect(nome('Supermercado')).toBe('Despesas da Casa');
    expect(nome('Aluguel e Cobranças')).toBe('Moradia');
    expect(nome('Restaurantes e Bares')).toBe('Entretenimento');
    expect(nome('Shopping')).toBe('Compras');
    expect(nome('Transport')).toBe('Transporte');
    expect(nome('Viagem ✈️')).toBe('Viagens');
    expect(nome('Contas de  Consumo 🏠')).toBe('Contas de Consumo');
    expect(nome('Carrinho 🚗')).toBe('Carro');
    expect(nome('Gatinhos 🐱')).toBe('Gatinhos');
    expect(nome('Seguro')).toBe('Seguro');
    expect(nome('Saúde')).toBe('Outros');
    expect(nome('Sem categoria')).toBe('Outros');
    expect(nome('Outro')).toBe('Outros');
  });
});

describe('plano e eventos da importação', () => {
  it('acha o último acerto do Tricount e deixa em aberto só o que veio depois', () => {
    const ana = novaCasa();
    const analise = analisarTricount(CSV);
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());

    expect(plano.ultimoAcerto).toBe('2026-11-03');
    expect(plano.residuoA).toBe(RESIDUO_A);
    expect(plano.saldoFinalA).toBe(SALDO_TRICOUNT_A);
    expect(plano.substitui).toBe(false);
    // 5 despesas positivas (a do jantar dividida em duas) + o ajuste do reembolso feito depois do acerto
    expect(plano.despesas).toHaveLength(7);
    expect(plano.divididas).toBe(1);
    expect(plano.transferencias).toBe(1);
    expect(plano.emAberto).toBe(1);
    expect(plano.mesesFechar).toEqual(['2026-09', '2026-10']);
    expect(plano.porMes.map((m) => [m.competencia, m.quantidade, m.total, m.emAberto, m.fechado])).toEqual([
      ['2026-09', 2, 110000, 0, true],
      ['2026-10', 2, 9000, 0, true],
      ['2026-11', 2, 5333, 1, false],
    ]);

    const porNome = (n: string): DespesaPlanejada | undefined => plano.despesas.find((d) => d.dados.descricao === n);
    expect(porNome('Mercado')?.dados).toMatchObject({ valor: 10000, pagador: 'A', pctA: 6000, competencia: '2026-09', data: '2026-09-05' });
    expect(porNome('Mercado')?.acertada).toBe(false); // mês fechado: o fechamento já resolve
    expect(porNome('Farmácia')).toMatchObject({ acertada: true, dados: { pctA: 0 } });
    expect(porNome('Padaria')?.acertada).toBe(false);
    const jantares = plano.despesas.filter((d) => d.dados.descricao.startsWith('Jantar'));
    expect(jantares.map((d) => [d.dados.pagador, d.dados.valor, d.dados.pctA])).toEqual([
      ['A', 3000, 5000],
      ['B', 6000, 5000],
    ]);
    // o reembolso de depois do acerto (−5 para a Ana) entra como saldo pendente
    expect(plano.ajuste?.dados).toMatchObject({ valor: 500, pagador: 'B', pctA: 10000, competencia: '2026-11' });

    ana.aplicar(gerarEventosImportacao(plano, ana.estado(), ana.ctx));
    const estado = ana.estado();
    expect(estado.despesas.filter((d) => d.origem.tipo === 'importada')).toHaveLength(7);
    expect(mesFechado(estado, LIVRO_CASA, '2026-09')).toBe(true);
    expect(mesFechado(estado, LIVRO_CASA, '2026-10')).toBe(true);
    expect(mesFechado(estado, LIVRO_CASA, '2026-11')).toBe(false);
    expect(fechamentoDe(estado, LIVRO_CASA, '2026-09')).toMatchObject({ totalGasto: 110000, importado: true });
    expect(estado.despesas.find((d) => d.descricao === 'Farmácia')?.origem).toEqual({ tipo: 'importada', acertada: true });

    // Novembro: a farmácia conta no total, mas não no saldo; o saldo é o do Tricount sem os centavos
    const nov = novembro(estado);
    expect(nov.saldoA).toBe(SALDO_TRICOUNT_A - RESIDUO_A);
    expect(nov.totalGasto).toBe(3333 + 2000 + 500);
    expect(nov.totalJaAcertado).toBe(3333);
    expect(nov.jaAcertadoA).toBe(3333);
    expect(nov.pagoPor.A).toBe(3333);
    const ajuste = estado.despesas.find((d) => d.descricao === 'Saldo pendente do Tricount');
    expect(ajuste?.categoriaId).toBe(idCategoria(estado, 'Outros'));
  });

  it('o arquivo na ordem do Tricount (mais novo primeiro) dá o mesmo resultado', () => {
    const a = novaCasa();
    const b = novaCasa();
    const p1 = importar(a, CSV);
    const p2 = importar(b, CSV_DO_MAIS_NOVO);
    expect(p2.ultimoAcerto).toBe(p1.ultimoAcerto);
    expect(p2.residuoA).toBe(p1.residuoA);
    expect(p2.despesas.map((d) => [d.id, d.acertada]).sort()).toEqual(p1.despesas.map((d) => [d.id, d.acertada]).sort());
    expect(novembro(b.estado()).saldoA).toBe(novembro(a.estado()).saldoA);
  });

  it('no mesmo dia do acerto, vale a ordem do arquivo', () => {
    const ana = novaCasa();
    // Do mais novo para o mais antigo, como o Tricount exporta: o pão veio DEPOIS do acerto.
    const csv = [
      CABECALHO,
      linha('Pão', '10', 'Despesa', 'Supermercado', 'Ana', '10', '0', '-5', '-5', '3 de novembro de 2026 09:00'),
      linha('Acerto', '50', 'Transferência de dinheiro', '', 'Bruno', '0', '50', '-50', '0', '3 de novembro de 2026 08:00'),
      linha('Mercado', '100', 'Despesa', 'Supermercado', 'Ana', '100', '0', '-50', '-50', '1 de novembro de 2026 10:00'),
    ].join('\n');
    const plano = importar(ana, csv);
    expect(plano.residuoA).toBe(0);
    expect(plano.emAberto).toBe(1);
    expect(plano.despesas.map((d) => [d.dados.descricao, d.acertada])).toEqual([
      ['Pão', false],
      ['Mercado', true],
    ]);
    expect(novembro(ana.estado()).saldoA).toBe(500);
  });

  it('importar o mesmo arquivo de novo não muda nada', () => {
    const ana = novaCasa();
    importar(ana);
    const quantos = ana.estado().projecao.eventos.length;
    const analise = analisarTricount(CSV);
    const segundo = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(segundo.substitui).toBe(true);
    expect(segundo.jaImportadas).toBe(7);
    expect(mudancasDoPlano(segundo)).toBe(0);
    ana.aplicar(gerarEventosImportacao(segundo, ana.estado(), ana.ctx));
    expect(ana.estado().projecao.eventos).toHaveLength(quantos);
  });

  it('corrige uma importação anterior que ficou errada ou foi mexida', () => {
    const ana = novaCasa();
    importar(ana);
    const id = (n: string): string => ana.estado().despesas.find((d) => d.descricao === n)?.id ?? '';
    // Como se tivesse sido importado pela regra antiga e depois mexido à mão:
    ana.aplicar([
      // a farmácia entrou sem a marca de acertada
      novoEvento(ana.ctx, 'alterar', 'despesa', id('Farmácia'), { acertadaNoTricount: false }),
      // a padaria foi apagada
      novoEvento(ana.ctx, 'alterar', 'despesa', id('Padaria'), { excluida: true }),
      // um "Saldo pendente" antigo, de outra conta
      novoEvento(ana.ctx, 'criar', 'despesa', 'tri_ajuste_antigo', camposNovaDespesa(
        { valor: 99900, descricao: 'Saldo pendente do Tricount', data: '2026-11-15', competencia: '2026-11', categoriaId: idCategoria(ana.estado(), 'Outros'), pagador: 'B', pctA: 10000, pctPadrao: false },
        { tipo: 'importada', acertada: false },
      )),
    ]);
    // outubro foi reaberto à mão e novembro tinha sido fechado pela importação antiga
    ana.fazer((e, ctx) => reabrirMes(e, LIVRO_CASA, '2026-10', ctx));
    ana.aplicar(fecharMes(ana.estado(), LIVRO_CASA, '2026-11', ana.ctx).ok
      ? (fecharMes(ana.estado(), LIVRO_CASA, '2026-11', ana.ctx) as { eventos: readonly Evento[] }).eventos.map((e) => ({ ...e, campos: { ...e.campos, importado: true } }))
      : []);
    expect(mesFechado(ana.estado(), LIVRO_CASA, '2026-11')).toBe(true);

    const analise = analisarTricount(CSV);
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(plano.substitui).toBe(true);
    expect(plano.despesas).toHaveLength(0);
    expect(plano.corrigir.map((d) => d.dados.descricao)).toEqual(['Farmácia', 'Padaria']);
    expect(plano.remover).toEqual(['tri_ajuste_antigo']);
    expect(plano.mesesReabrir).toEqual(['2026-11']);
    expect(plano.mesesFechar).toEqual(['2026-10']);
    expect(plano.mesesJaFechados).toEqual([]);
    expect(mudancasDoPlano(plano)).toBe(5);

    ana.avancarMinutos(5);
    ana.aplicar(gerarEventosImportacao(plano, ana.estado(), ana.ctx));
    const estado = ana.estado();
    expect(mesFechado(estado, LIVRO_CASA, '2026-10')).toBe(true);
    expect(mesFechado(estado, LIVRO_CASA, '2026-11')).toBe(false);
    expect(novembro(estado).saldoA).toBe(SALDO_TRICOUNT_A - RESIDUO_A);
    expect(estado.despesas.filter((d) => !d.excluida && d.origem.tipo === 'importada')).toHaveLength(7);
    expect(divergenciasDeFechamento(estado, LIVRO_CASA)).toEqual([]);
    // e uma terceira vez não muda mais nada
    expect(mudancasDoPlano(planejarImportacao(analise, opcoes(estado, analise), estado))).toBe(0);
    // no histórico, a correção aparece numa linha só
    const feed = gerarAtividade(estado.projecao.eventos, estado.config);
    expect(feed[0]?.textos).toEqual(['Ana corrigiu a importação do Tricount: 5 mudanças']);
  });

  it('a correção tira despesas importadas que não estão mais no arquivo', () => {
    const ana = novaCasa();
    importar(ana);
    const menor = [CABECALHO, ...LINHAS.filter((l) => !l.startsWith('"Padaria"'))].join('\n');
    const analise = analisarTricount(menor);
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(plano.remover).toContain(ana.estado().despesas.find((d) => d.descricao === 'Padaria')?.id);
  });

  it('linhas idênticas viram despesas diferentes', () => {
    const ana = novaCasa();
    const l = linha('Café', '8.00', 'Despesa', 'Outro', 'Ana', '8.00', '0', '-4.00', '-4.00', '1 de novembro de 2026 08:00');
    const analise = analisarTricount([CABECALHO, l, l].join('\n'));
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(new Set(plano.despesas.map((d) => d.id)).size).toBe(2);
  });

  it('Tricount zerado: fecha o mês e não cria ajuste', () => {
    const ana = novaCasa();
    const analise = analisarTricount(
      [
        CABECALHO,
        linha('Mercado', '100', 'Despesa', 'Supermercado', 'Ana', '100', '0', '-50', '-50', '1 de outubro de 2026'),
        linha('Acerto', '50', 'Transferência de dinheiro', '', 'Bruno', '0', '50', '-50', '0', '2 de outubro de 2026'),
      ].join('\n'),
    );
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(plano.saldoFinalA).toBe(0);
    expect(plano.ajuste).toBeNull();
    expect(plano.emAberto).toBe(0);
    expect(plano.mesesFechar).toEqual(['2026-10']);
  });

  it('sem nenhum acerto no Tricount, tudo entra em aberto', () => {
    const ana = novaCasa();
    const plano = importar(ana, [CABECALHO, LINHAS[0] ?? '', LINHAS[1] ?? ''].join('\n'));
    expect(plano.ultimoAcerto).toBeNull();
    expect(plano.mesesFechar).toEqual([]);
    expect(plano.ajuste).toBeNull();
    expect(plano.emAberto).toBe(2);
    expect(mesFechado(ana.estado(), LIVRO_CASA, '2026-09')).toBe(false);
  });

  it('um pagamento parcial depois do acerto vira saldo pendente; Ana a receber → pago por ela', () => {
    const ana = novaCasa();
    const plano = importar(
      ana,
      [
        CABECALHO,
        linha('Luz', '80', 'Despesa', 'Contas de Consumo', 'Ana', '80', '0', '-40', '-40', '1 de outubro de 2026'),
        linha('Parte', '10', 'Transferência de dinheiro', '', 'Ana', '10', '0', '0', '-10', '2 de novembro de 2026'),
      ].join('\n'),
    );
    expect(plano.ultimoAcerto).toBeNull();
    expect(plano.ajuste?.dados).toMatchObject({ valor: 1000, pagador: 'A', pctA: 0 });
    expect(novembro(ana.estado()).saldoA).toBe(1000);
    expect(resumirMes('2026-10', ana.estado().despesas.filter((d) => d.competencia === '2026-10')).saldoA).toBe(4000);
  });

  it('as pessoas podem ser trocadas (o nome do Tricount não precisa ser o do app)', () => {
    const ana = novaCasa();
    const analise = analisarTricount(CSV);
    const plano = planejarImportacao(analise, { ...opcoes(ana.estado(), analise), pessoaDe: { Ana: 'B', Bruno: 'A' } }, ana.estado());
    expect(plano.saldoFinalA).toBe(-SALDO_TRICOUNT_A);
    expect(plano.residuoA).toBe(-RESIDUO_A);
    expect(plano.despesas.find((d) => d.dados.descricao === 'Mercado')?.dados).toMatchObject({ pagador: 'B', pctA: 4000 });
  });

  it('exige uma pessoa diferente do app para cada pessoa do Tricount', () => {
    const ana = novaCasa();
    const analise = analisarTricount(CSV);
    expect(() => planejarImportacao(analise, { ...opcoes(ana.estado(), analise), pessoaDe: { Ana: 'A', Bruno: 'A' } }, ana.estado())).toThrow(
      ErroImportacao,
    );
  });

  it('exige categoria para todas as despesas', () => {
    const ana = novaCasa();
    const analise = analisarTricount(CSV);
    const plano = planejarImportacao(analise, { ...opcoes(ana.estado(), analise), categoriaDe: {} }, ana.estado());
    const r = gerarEventosImportacao(plano, ana.estado(), ana.ctx);
    expect(r.ok).toBe(false);
  });

  it('avisa sobre meses que já estavam fechados no app e não os fecha de novo', () => {
    const ana = novaCasa();
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-09', ctx));
    const analise = analisarTricount(CSV);
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(plano.mesesJaFechados).toEqual(['2026-09']);
    expect(plano.mesesFechar).toEqual(['2026-10']);
  });

  it('as despesas importadas ensinam as sugestões', () => {
    const ana = novaCasa();
    importar(ana);
    expect(sugerir(ana.estado(), 'merc')[0]?.descricao).toBe('Mercado');
    expect(sugerir(ana.estado(), 'saldo pendente')[0]?.descricao).toBe('Saldo pendente do Tricount');
  });
});

describe('atividade da importação', () => {
  it('a importação aparece numa linha só, e cada despesa conta sua origem', () => {
    const ana = novaCasa();
    ana.avancarMinutos(5);
    importar(ana);
    const estado = ana.estado();
    const feed = gerarAtividade(estado.projecao.eventos, estado.config);
    expect(feed[0]?.textos).toEqual(['Ana importou do Tricount: 7 despesas e 2 meses acertados']);
    expect(feed.filter((i) => i.textos.some((t) => t.includes('Tricount')))).toHaveLength(1);

    const mercado = estado.despesas.find((d) => d.descricao === 'Mercado');
    const linhaDoTempo = gerarAtividade(estado.projecao.eventos.filter((e) => e.entidadeId === mercado?.id), estado.config);
    expect(linhaDoTempo[0]?.textos[0]).toMatch(/^Ana importou Mercado do Tricount: R\$\s100,00$/);
    const fech = gerarAtividade(estado.projecao.eventos.filter((e) => e.entidade === 'fechamento').slice(0, 1), estado.config);
    expect(fech[0]?.textos[0]).toMatch(/^Ana importou o acerto de setembro/i);
  });

  it('importação de uma despesa e um mês, ou só de despesas', () => {
    const umMes = novaCasa();
    importar(umMes, [
      CABECALHO,
      linha('Mercado', '100', 'Despesa', 'Supermercado', 'Ana', '100', '0', '-50', '-50', '1 de outubro de 2026'),
      linha('Acerto', '50', 'Transferência de dinheiro', '', 'Bruno', '0', '50', '-50', '0', '2 de outubro de 2026'),
    ].join('\n'));
    expect(gerarAtividade(umMes.estado().projecao.eventos, umMes.estado().config)[0]?.textos[0]).toBe(
      'Ana importou do Tricount: 1 despesa e 1 mês acertado',
    );
    const soDespesas = novaCasa();
    importar(soDespesas, [CABECALHO, LINHAS[0] ?? '', LINHAS[1] ?? ''].join('\n'));
    expect(gerarAtividade(soDespesas.estado().projecao.eventos, soDespesas.estado().config)[0]?.textos[0]).toBe(
      'Ana importou do Tricount: 2 despesas',
    );
  });
});
