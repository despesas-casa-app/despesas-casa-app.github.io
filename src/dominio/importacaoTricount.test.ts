import { describe, expect, it } from 'vitest';
import { gerarAtividade } from './atividade.ts';
import type { Estado } from './estado.ts';
import { fechamentoDe, mesFechado } from './estado.ts';
import { fecharMes } from './fechamento.ts';
import {
  analisarTricount,
  ErroImportacao,
  gerarEventosImportacao,
  lerDataTricount,
  lerValorTricount,
  planejarImportacao,
  sugerirCategorias,
  type AnaliseTricount,
  type OpcoesImportacao,
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
  // outubro: transferência de Bruno para Ana, 200
  linha('Acerto', '200.00', 'Transferência de dinheiro', '', 'Bruno', '0', '200.00', '-200.00', '0', '20 de outubro de 2026 08:00'),
  // novembro (mês corrente): farmácia 33.33 pago pela Ana, tudo do Bruno
  linha('Farmácia', '33.33', 'Despesa', 'Saúde', 'Ana', '33.33', '0', '0', '-33.33', '2 de novembro de 2026 12:00'),
  // reembolso (valor negativo): entra só no saldo
  linha('Devolução', '-10.00', 'Despesa', 'Shopping', 'Ana', '-10.00', '0', '5.00', '5.00', '4 de novembro de 2026 12:00'),
  // rodapé do Tricount
  '"Total","","","","1213.33","","","","","","","","",""',
  '"Exportado pelo Tricount","","","","","","","","","","","","",""',
];

const CSV = '﻿' + [CABECALHO, ...LINHAS].join('\r\n') + '\r\n';

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

/** Saldo do Tricount calculado à mão a partir do arquivo fictício (positivo: Ana tem a receber). */
// Mercado: +100 −60 = +40 · Aluguel: −500 · Jantar: +30 −45 = −15 · Transferência: Bruno pagou 200 para
// Ana (parte da Ana 200) → −200 · Farmácia: +33,33 · Devolução: −10 +5... (parte −5) → −10 − (−5) = −5
const SALDO_TRICOUNT_A = 4000 - 50000 - 1500 - 20000 + 3333 - 500;

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
    expect(a.linhas.filter((l) => l.tipo === 'despesa')).toHaveLength(5);
    expect(a.linhas.filter((l) => l.tipo === 'transferencia')).toHaveLength(1);
    expect(a.ignoradas.map((i) => i.numero)).toEqual([8, 9]);
    const jantar = a.linhas.find((l) => l.titulo === 'Jantar, "especial"');
    expect(jantar?.pagos.get('Bruno')).toBe(6000);
    expect(jantar?.partes.get('Ana')).toBe(4500);
    expect(a.categorias.get('Supermercado')).toBe(1);
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
  it('monta as despesas, fecha os meses passados e acerta o saldo pendente', () => {
    const ana = novaCasa();
    const analise = analisarTricount(CSV);
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());

    // 4 despesas positivas, a do jantar dividida em duas (uma por quem pagou)
    expect(plano.despesas).toHaveLength(5);
    expect(plano.divididas).toBe(1);
    expect(plano.transferencias).toBe(1);
    expect(plano.mesesFechar).toEqual(['2026-09', '2026-10']);
    expect(plano.porMes.map((m) => [m.competencia, m.quantidade, m.total, m.fechado])).toEqual([
      ['2026-09', 2, 110000, true],
      ['2026-10', 2, 9000, true],
      ['2026-11', 1, 3333, false],
    ]);
    expect(plano.saldoFinalA).toBe(SALDO_TRICOUNT_A);

    const mercado = plano.despesas.find((d) => d.dados.descricao === 'Mercado');
    expect(mercado?.dados).toMatchObject({ valor: 10000, pagador: 'A', pctA: 6000, competencia: '2026-09', data: '2026-09-05' });
    const farmacia = plano.despesas.find((d) => d.dados.descricao === 'Farmácia');
    expect(farmacia?.dados.pctA).toBe(0);
    const jantares = plano.despesas.filter((d) => d.dados.descricao.startsWith('Jantar'));
    expect(jantares.map((d) => [d.dados.pagador, d.dados.valor, d.dados.pctA])).toEqual([
      ['A', 3000, 5000],
      ['B', 6000, 5000],
    ]);

    ana.aplicar(gerarEventosImportacao(plano, ana.estado(), ana.ctx));
    const estado = ana.estado();
    expect(estado.despesas.filter((d) => d.origem.tipo === 'importada')).toHaveLength(6);
    expect(mesFechado(estado, LIVRO_CASA, '2026-09')).toBe(true);
    expect(mesFechado(estado, LIVRO_CASA, '2026-10')).toBe(true);
    expect(mesFechado(estado, LIVRO_CASA, '2026-11')).toBe(false);
    expect(fechamentoDe(estado, LIVRO_CASA, '2026-09')).toMatchObject({ totalGasto: 110000, importado: true });

    // O mês em aberto fica exatamente com o saldo do Tricount
    const novembro = resumirMes('2026-11', estado.despesas.filter((d) => d.competencia === '2026-11' && !d.excluida));
    expect(novembro.saldoA).toBe(SALDO_TRICOUNT_A);
    const ajuste = estado.despesas.find((d) => d.descricao === 'Saldo pendente do Tricount');
    expect(ajuste).toMatchObject({ pagador: 'B', pctA: 10000, competencia: '2026-11', categoriaId: idCategoria(estado, 'Outros') });
  });

  it('importar o mesmo arquivo de novo não duplica nada', () => {
    const ana = novaCasa();
    const analise = analisarTricount(CSV);
    ana.aplicar(gerarEventosImportacao(planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado()), ana.estado(), ana.ctx));
    const quantas = ana.estado().despesas.length;

    const segundo = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(segundo.despesas).toHaveLength(0);
    expect(segundo.ajuste).toBeNull();
    expect(segundo.jaImportadas).toBe(5);
    expect(segundo.mesesFechar).toEqual([]);
    ana.aplicar(gerarEventosImportacao(segundo, ana.estado(), ana.ctx));
    expect(ana.estado().despesas).toHaveLength(quantas);
  });

  it('linhas idênticas viram despesas diferentes', () => {
    const ana = novaCasa();
    const l = linha('Café', '8.00', 'Despesa', 'Outro', 'Ana', '8.00', '0', '-4.00', '-4.00', '1 de novembro de 2026 08:00');
    const analise = analisarTricount([CABECALHO, l, l].join('\n'));
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(new Set(plano.despesas.map((d) => d.id)).size).toBe(2);
  });

  it('sem saldo pendente, não cria o lançamento de ajuste', () => {
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
  });

  it('quando Ana tem a receber, o ajuste fica como pago por ela', () => {
    const ana = novaCasa();
    const analise = analisarTricount(
      [CABECALHO, linha('Luz', '80', 'Despesa', 'Contas de Consumo', 'Ana', '80', '0', '-40', '-40', '1 de outubro de 2026')].join('\n'),
    );
    const plano = planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado());
    expect(plano.ajuste?.dados).toMatchObject({ valor: 4000, pagador: 'A', pctA: 0 });
    ana.aplicar(gerarEventosImportacao(plano, ana.estado(), ana.ctx));
    const novembro = resumirMes('2026-11', ana.estado().despesas.filter((d) => d.competencia === '2026-11'));
    expect(novembro.saldoA).toBe(4000);
  });

  it('as pessoas podem ser trocadas (o nome do Tricount não precisa ser o do app)', () => {
    const ana = novaCasa();
    const analise = analisarTricount(CSV);
    const plano = planejarImportacao(analise, { ...opcoes(ana.estado(), analise), pessoaDe: { Ana: 'B', Bruno: 'A' } }, ana.estado());
    expect(plano.saldoFinalA).toBe(-SALDO_TRICOUNT_A);
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
    const analise = analisarTricount(CSV);
    ana.aplicar(gerarEventosImportacao(planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado()), ana.estado(), ana.ctx));
    expect(sugerir(ana.estado(), 'merc')[0]?.descricao).toBe('Mercado');
    expect(sugerir(ana.estado(), 'saldo pendente')[0]?.descricao).toBe('Saldo pendente do Tricount');
  });
});

describe('atividade da importação', () => {
  it('a importação aparece numa linha só, e cada despesa conta sua origem', () => {
    const ana = novaCasa();
    ana.avancarMinutos(5);
    const analise = analisarTricount(CSV);
    ana.aplicar(gerarEventosImportacao(planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado()), ana.estado(), ana.ctx));
    const estado = ana.estado();
    const feed = gerarAtividade(estado.projecao.eventos, estado.config);
    expect(feed[0]?.textos).toEqual(['Ana importou do Tricount: 6 despesas e 2 meses acertados']);
    expect(feed.filter((i) => i.textos.some((t) => t.includes('Tricount')))).toHaveLength(1);

    const mercado = estado.despesas.find((d) => d.descricao === 'Mercado');
    const linhaDoTempo = gerarAtividade(estado.projecao.eventos.filter((e) => e.entidadeId === mercado?.id), estado.config);
    expect(linhaDoTempo[0]?.textos[0]).toMatch(/^Ana importou Mercado do Tricount: R\$\s100,00$/);
    const fech = gerarAtividade(estado.projecao.eventos.filter((e) => e.entidade === 'fechamento').slice(0, 1), estado.config);
    expect(fech[0]?.textos[0]).toMatch(/^Ana importou o acerto de setembro/i);
  });

  it('importação seguida só de acertos ou só de uma despesa', () => {
    const ana = novaCasa();
    const analise = analisarTricount([CABECALHO, LINHAS[0] ?? '', LINHAS[1] ?? ''].join('\n'));
    ana.aplicar(gerarEventosImportacao(planejarImportacao(analise, opcoes(ana.estado(), analise), ana.estado()), ana.estado(), ana.ctx));
    const estado = ana.estado();
    const feed = gerarAtividade(estado.projecao.eventos, estado.config);
    expect(feed[0]?.textos[0]).toBe('Ana importou do Tricount: 3 despesas e 1 mês acertado');
  });
});
