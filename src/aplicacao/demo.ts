// Dados FICTÍCIOS do modo demonstração. Nada aqui é real: nomes, valores e lojas são inventados.

import { criarCategoriasIniciais } from '../dominio/categorias.ts';
import { competenciaDaData, dataLocal, somarMeses, dataNoMes } from '../dominio/competencia.ts';
import { definirNomes } from '../dominio/config.ts';
import { alterarDespesa, criarDespesa } from '../dominio/despesas.ts';
import type { Estado } from '../dominio/estado.ts';
import { fecharMes } from '../dominio/fechamento.ts';
import { criarParcelamento } from '../dominio/parcelamentos.ts';
import { criarRecorrente, gerarRecorrentesPendentes } from '../dominio/recorrentes.ts';
import { LIVRO_CASA, type Pessoa } from '../dominio/tipos.ts';
import type { Loja, Regra } from './loja.ts';

export const NOMES_DEMO = { A: 'Ana', B: 'Bruno' } as const;
export const PCT_PROPORCIONAL_DEMO = 6000;

function categoria(estado: Estado, nome: string): string {
  return estado.categorias.find((c) => c.nome === nome)?.id ?? '';
}

/** Momento fictício: dia D do mês (relativo ao atual), às H horas. */
function momento(hoje: Date, mesesAtras: number, dia: number, hora = 12): Date {
  const c = somarMeses(competenciaDaData(dataLocal(hoje)), -mesesAtras);
  const data = dataNoMes(c, dia);
  const d = new Date(`${data}T00:00:00`);
  d.setHours(hora, Math.floor(dia * 7) % 60);
  return d.getTime() > hoje.getTime() ? hoje : d;
}

interface Lancamento {
  readonly mesesAtras: number;
  readonly dia: number;
  readonly descricao: string;
  readonly categoria: string;
  readonly valor: number;
  readonly pagador: Pessoa;
}

const LANCAMENTOS: readonly Lancamento[] = [
  { mesesAtras: 2, dia: 3, descricao: 'Mercado', categoria: 'Despesas da Casa', valor: 38740, pagador: 'A' },
  { mesesAtras: 2, dia: 6, descricao: 'Padaria', categoria: 'Despesas da Casa', valor: 2350, pagador: 'B' },
  { mesesAtras: 2, dia: 9, descricao: 'Ração dos gatos', categoria: 'Gatinhos', valor: 18990, pagador: 'B' },
  { mesesAtras: 2, dia: 14, descricao: 'Gasolina', categoria: 'Carro', valor: 25000, pagador: 'A' },
  { mesesAtras: 2, dia: 18, descricao: 'Cinema', categoria: 'Entretenimento', valor: 8800, pagador: 'B' },
  { mesesAtras: 2, dia: 22, descricao: 'Mercado', categoria: 'Despesas da Casa', valor: 29315, pagador: 'B' },
  { mesesAtras: 2, dia: 27, descricao: 'Farmácia', categoria: 'Outros', valor: 6420, pagador: 'A' },
  { mesesAtras: 1, dia: 2, descricao: 'Mercado', categoria: 'Despesas da Casa', valor: 41260, pagador: 'A' },
  { mesesAtras: 1, dia: 5, descricao: 'Padaria', categoria: 'Despesas da Casa', valor: 1980, pagador: 'B' },
  { mesesAtras: 1, dia: 8, descricao: 'Uber', categoria: 'Transporte', valor: 3450, pagador: 'A' },
  { mesesAtras: 1, dia: 12, descricao: 'Veterinário', categoria: 'Gatinhos', valor: 32000, pagador: 'A' },
  { mesesAtras: 1, dia: 16, descricao: 'Restaurante', categoria: 'Entretenimento', valor: 21780, pagador: 'B' },
  { mesesAtras: 1, dia: 20, descricao: 'Mercado', categoria: 'Despesas da Casa', valor: 33605, pagador: 'B' },
  { mesesAtras: 1, dia: 24, descricao: 'Gasolina', categoria: 'Carro', valor: 23000, pagador: 'B' },
  { mesesAtras: 1, dia: 28, descricao: 'Padaria', categoria: 'Despesas da Casa', valor: 2640, pagador: 'A' },
  { mesesAtras: 0, dia: 1, descricao: 'Mercado', categoria: 'Despesas da Casa', valor: 36420, pagador: 'A' },
  { mesesAtras: 0, dia: 2, descricao: 'Padaria', categoria: 'Despesas da Casa', valor: 2210, pagador: 'B' },
  { mesesAtras: 0, dia: 4, descricao: 'Ração dos gatos', categoria: 'Gatinhos', valor: 18990, pagador: 'A' },
  { mesesAtras: 0, dia: 7, descricao: 'Uber', categoria: 'Transporte', valor: 2890, pagador: 'B' },
  { mesesAtras: 0, dia: 9, descricao: 'Farmácia', categoria: 'Outros', valor: 4570, pagador: 'B' },
];

const RECORRENTES = [
  { descricao: 'Aluguel', categoria: 'Moradia', pagador: 'A', tipoValor: 'fixo', valor: 250000, dia: 5 },
  { descricao: 'Condomínio', categoria: 'Moradia', pagador: 'B', tipoValor: 'fixo', valor: 78000, dia: 10 },
  { descricao: 'Conta de luz', categoria: 'Contas de Consumo', pagador: 'B', tipoValor: 'variavel', valor: 0, dia: 15 },
  { descricao: 'Internet', categoria: 'Contas de Consumo', pagador: 'A', tipoValor: 'fixo', valor: 11990, dia: 20 },
  { descricao: 'Streaming', categoria: 'Entretenimento', pagador: 'B', tipoValor: 'fixo', valor: 5590, dia: 12 },
] as const;

/** Valores fictícios da conta de luz de 2 meses atrás e do mês passado. */
const LUZ = [21340, 19875] as const;

interface Acao {
  readonly quando: Date;
  readonly autor: Pessoa;
  readonly regra: Regra;
}

/**
 * Preenche um aparelho vazio com 3 meses de dados fictícios:
 * - há 2 meses: mês já acertado (fechado);
 * - mês passado: aberto, esperando o acerto;
 * - mês atual: em andamento, com recorrente "aguardando valor".
 *
 * As ações rodam em ordem de data, como teriam acontecido de verdade — assim os horários da
 * Atividade e da linha do tempo fazem sentido.
 */
export function semearDemonstracao(loja: Loja, hoje: Date = new Date()): void {
  const mesAtual = competenciaDaData(dataLocal(hoje));
  const inicio = somarMeses(mesAtual, -2);
  const acoes: Acao[] = [];
  const quando = (mesesAtras: number, dia: number, hora: number) => momento(hoje, mesesAtras, dia, hora);
  const adicionar = (q: Date, autor: Pessoa, regra: Regra) => acoes.push({ quando: q, autor, regra });

  adicionar(quando(2, 1, 9), 'A', (e, ctx) => definirNomes(e, NOMES_DEMO.A, NOMES_DEMO.B, ctx));
  adicionar(quando(2, 1, 9), 'A', (_, ctx) => criarCategoriasIniciais(PCT_PROPORCIONAL_DEMO, ctx));
  for (const r of RECORRENTES) {
    adicionar(quando(2, 1, 10), 'A', (e, ctx) =>
      criarRecorrente(e, {
        descricao: r.descricao, categoriaId: categoria(e, r.categoria), pagador: r.pagador,
        tipoValor: r.tipoValor, valor: r.valor, dia: r.dia, inicio, fim: null, pctA: null,
      }, ctx),
    );
  }
  adicionar(quando(2, 11, 19), 'A', (e, ctx) =>
    criarParcelamento(e, {
      descricao: 'Sofá', categoriaId: categoria(e, 'Compras'), pagador: 'A', pctA: 5000, pctPadrao: true,
      n: 10, valorParcela: 45000, dataCompra: dataLocal(quando(2, 11, 12)), primeiraCompetencia: inicio,
    }, ctx),
  );

  for (const l of LANCAMENTOS) {
    if (l.mesesAtras === 0 && l.dia > hoje.getDate()) continue;
    const q = quando(l.mesesAtras, l.dia, 18);
    adicionar(q, l.pagador, (e, ctx) =>
      criarDespesa(e, {
        valor: l.valor, descricao: l.descricao, data: dataLocal(q), competencia: competenciaDaData(dataLocal(q)),
        categoriaId: categoria(e, l.categoria), pagador: l.pagador,
        pctA: e.categorias.find((c) => c.nome === l.categoria)?.pctA ?? 5000, pctPadrao: true,
      }, ctx),
    );
  }

  // Bruno informa a conta de luz de cada mês passado.
  LUZ.forEach((valor, i) => {
    const mesesAtras = 2 - i;
    const c = somarMeses(mesAtual, -mesesAtras);
    adicionar(quando(mesesAtras, 16, 20), 'B', (e, ctx) => {
      const d = e.despesas.find((x) => x.descricao === 'Conta de luz' && x.competencia === c && x.status === 'aguardando');
      return d ? alterarDespesa(e, d.id, { valor }, ctx) : [];
    });
  });

  // Ao virar cada mês, o app gera as recorrentes do mês.
  for (const mesesAtras of [1, 0]) {
    adicionar(quando(mesesAtras, 1, 8), 'A', (e, ctx) => gerarRecorrentesPendentes(e, ctx));
  }

  // Uma edição feita pela outra pessoa, para aparecer o selo "editado por" e a linha do tempo.
  adicionar(quando(1, 3, 8), 'B', (e, ctx) => {
    const d = e.despesas.find((x) => x.descricao === 'Mercado' && x.competencia === somarMeses(inicio, 1) && x.origem.tipo === 'manual');
    return d ? alterarDespesa(e, d.id, { valor: d.valor + 1500 }, ctx) : [];
  });

  // O mês de 2 meses atrás já foi acertado.
  adicionar(quando(1, 3, 21), 'A', (e, ctx) => fecharMes(e, LIVRO_CASA, inicio, ctx));

  acoes
    .map((a, i) => ({ ...a, i }))
    .sort((a, b) => a.quando.getTime() - b.quando.getTime() || a.i - b.i)
    .forEach((a) => {
      loja.executar(a.regra, { ...loja.contexto(a.quando), autor: a.autor });
    });
}
