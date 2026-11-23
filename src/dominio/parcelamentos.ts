import { dataNoMes, diaDaData, ehCompetencia, ehDataValida, somarMeses } from './competencia.ts';
import {
  invalido,
  mesFechadoFalha,
  novoEvento,
  sucesso,
  type Contexto,
  type Resultado,
} from './contexto.ts';
import { camposNovaDespesa } from './despesas.ts';
import { ehCentavosValidos, type Centavos } from './dinheiro.ts';
import { VALOR_MAXIMO } from './divisao.ts';
import type { Evento, ValorCampo } from './eventos.ts';
import { categoriaPorId, mesFechado, type Despesa, type Estado } from './estado.ts';
import { ehPercentualValido } from './percentual.ts';
import { LIVRO_CASA, type Competencia, type DataISO, type Pessoa, type PontosBase } from './tipos.ts';

export const MAXIMO_PARCELAS = 72;

/** Marca as exclusões feitas pelo cancelamento das parcelas restantes. */
export const MOTIVO_CANCELAMENTO = 'parcelamento-cancelado';

/** Id DETERMINÍSTICO da parcela k (1..n) de um parcelamento. */
export function idParcela(parcelamentoId: string, k: number): string {
  return `parc_${parcelamentoId}_${String(k)}`;
}

/**
 * Valores das parcelas. Informado pelo total, os centavos que não dividem por igual vão para a
 * 1ª parcela (especificação 4.4). Ex.: R$ 100,00 em 3x → 33,34 + 33,33 + 33,33.
 */
export function valoresDasParcelas(total: Centavos, n: number): Centavos[] {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

export interface DadosParcelamento {
  readonly descricao: string;
  readonly categoriaId: string;
  readonly pagador: Pessoa;
  readonly pctA: PontosBase;
  readonly pctPadrao: boolean;
  readonly n: number;
  /** Informe um dos dois. */
  readonly valorTotal?: Centavos;
  readonly valorParcela?: Centavos;
  readonly dataCompra: DataISO;
  readonly primeiraCompetencia: Competencia;
}

/** Lança a compra parcelada e gera TODAS as parcelas de uma vez, cada uma no seu mês. */
export function criarParcelamento(estado: Estado, d: DadosParcelamento, ctx: Contexto): Resultado {
  if (d.descricao.trim() === '') return invalido('Informe a descrição.');
  if (!categoriaPorId(estado, d.categoriaId)) return invalido('Escolha uma categoria.');
  if (!Number.isInteger(d.n) || d.n < 2 || d.n > MAXIMO_PARCELAS) {
    return invalido(`O número de parcelas deve ser de 2 a ${String(MAXIMO_PARCELAS)}.`);
  }
  if (!ehPercentualValido(d.pctA)) return invalido('Percentual inválido.');
  if (!ehDataValida(d.dataCompra)) return invalido('Data inválida.');
  if (!ehCompetencia(d.primeiraCompetencia)) return invalido('Mês da 1ª parcela inválido.');

  const total = d.valorTotal ?? (d.valorParcela !== undefined ? d.valorParcela * d.n : undefined);
  if (total === undefined || !ehCentavosValidos(total) || total < d.n || total > VALOR_MAXIMO) {
    return invalido('Informe o valor.');
  }
  if (mesFechado(estado, LIVRO_CASA, d.primeiraCompetencia)) return mesFechadoFalha(d.primeiraCompetencia);

  const id = ctx.novoId();
  const descricao = d.descricao.trim();
  const eventos: Evento[] = [
    novoEvento(ctx, 'criar', 'parcelamento', id, {
      descricao,
      categoriaId: d.categoriaId,
      pagador: d.pagador,
      valorTotal: total,
      n: d.n,
      primeiraCompetencia: d.primeiraCompetencia,
      dataCompra: d.dataCompra,
      pctA: d.pctA,
      status: 'ativo',
    }),
  ];
  const dia = diaDaData(d.dataCompra);
  valoresDasParcelas(total, d.n).forEach((valor, i) => {
    const c = somarMeses(d.primeiraCompetencia, i);
    eventos.push(
      novoEvento(
        ctx,
        'criar',
        'despesa',
        idParcela(id, i + 1),
        camposNovaDespesa(
          {
            valor,
            descricao,
            data: dataNoMes(c, dia),
            competencia: c,
            categoriaId: d.categoriaId,
            pagador: d.pagador,
            pctA: d.pctA,
            pctPadrao: d.pctPadrao,
          },
          { tipo: 'parcela', id, k: i + 1, n: d.n },
        ),
      ),
    );
  });
  return sucesso(eventos);
}

/** Parcelas vivas de um parcelamento, em ordem. */
export function parcelasDe(estado: Estado, parcelamentoId: string): Despesa[] {
  return estado.despesas
    .filter((d) => !d.excluida && d.origem.tipo === 'parcela' && d.origem.id === parcelamentoId)
    .sort((a, b) => (a.origem.tipo === 'parcela' && b.origem.tipo === 'parcela' ? a.origem.k - b.origem.k : 0));
}

/** Parcelas que ainda podem mudar: as de meses abertos a partir de "aPartirDe". */
export function parcelasRestantes(estado: Estado, parcelamentoId: string, aPartirDe: Competencia): Despesa[] {
  return parcelasDe(estado, parcelamentoId).filter(
    (p) => p.competencia >= aPartirDe && !mesFechado(estado, p.livro, p.competencia),
  );
}

/** Cancela as parcelas restantes (ex.: antecipação ou devolução). */
export function cancelarParcelasRestantes(
  estado: Estado,
  parcelamentoId: string,
  aPartirDe: Competencia,
  ctx: Contexto,
): Resultado {
  const p = estado.parcelamentos.find((x) => x.id === parcelamentoId);
  if (!p) return invalido('Parcelamento não encontrado.');
  // "motivo" deixa o feed de atividade mostrar uma linha só ("cancelou as parcelas restantes").
  const eventos = parcelasRestantes(estado, parcelamentoId, aPartirDe).map((d) =>
    novoEvento(ctx, 'alterar', 'despesa', d.id, { excluida: true, motivo: MOTIVO_CANCELAMENTO }),
  );
  eventos.push(novoEvento(ctx, 'alterar', 'parcelamento', parcelamentoId, { status: 'cancelado' }));
  return sucesso(eventos);
}

export interface MudancasParcelas {
  readonly valor?: Centavos;
  readonly categoriaId?: string;
  readonly pagador?: Pessoa;
  readonly pctA?: PontosBase;
  readonly descricao?: string;
}

/** Edita as parcelas restantes de uma vez. */
export function alterarParcelasRestantes(
  estado: Estado,
  parcelamentoId: string,
  aPartirDe: Competencia,
  m: MudancasParcelas,
  ctx: Contexto,
): Resultado {
  if (!estado.parcelamentos.some((x) => x.id === parcelamentoId)) return invalido('Parcelamento não encontrado.');
  if (m.valor !== undefined && (!ehCentavosValidos(m.valor) || m.valor <= 0)) return invalido('Valor inválido.');
  if (m.categoriaId !== undefined && !categoriaPorId(estado, m.categoriaId)) return invalido('Escolha uma categoria.');
  if (m.pctA !== undefined && !ehPercentualValido(m.pctA)) return invalido('Percentual inválido.');
  if (m.descricao?.trim() === '') return invalido('Informe a descrição.');

  const eventos: Evento[] = [];
  for (const d of parcelasRestantes(estado, parcelamentoId, aPartirDe)) {
    const campos: Record<string, ValorCampo> = {};
    if (m.valor !== undefined && m.valor !== d.valor) campos['valor'] = m.valor;
    if (m.categoriaId !== undefined && m.categoriaId !== d.categoriaId) campos['categoriaId'] = m.categoriaId;
    if (m.pagador !== undefined && m.pagador !== d.pagador) campos['pagador'] = m.pagador;
    if (m.pctA !== undefined && m.pctA !== d.pctA) {
      campos['pctA'] = m.pctA;
      campos['pctPadrao'] = false;
    }
    if (m.descricao !== undefined && m.descricao.trim() !== d.descricao) campos['descricao'] = m.descricao.trim();
    if (Object.keys(campos).length) eventos.push(novoEvento(ctx, 'alterar', 'despesa', d.id, campos));
  }
  const camposParc: Record<string, ValorCampo> = {};
  if (m.descricao !== undefined) camposParc['descricao'] = m.descricao.trim();
  if (m.categoriaId !== undefined) camposParc['categoriaId'] = m.categoriaId;
  if (m.pagador !== undefined) camposParc['pagador'] = m.pagador;
  if (m.pctA !== undefined) camposParc['pctA'] = m.pctA;
  if (Object.keys(camposParc).length) {
    eventos.push(novoEvento(ctx, 'alterar', 'parcelamento', parcelamentoId, camposParc));
  }
  return sucesso(eventos);
}
