import { dataNoMes, diaDaData, ehCompetencia, ehDataValida, nomeDaCompetencia, somarMeses } from './competencia.ts';
import {
  invalido,
  mesFechadoFalha,
  novoEvento,
  sucesso,
  type Contexto,
  type Resultado,
} from './contexto.ts';
import { camposNovaDespesa } from './despesas.ts';
import { ehCentavosValidos, formatarReais, type Centavos } from './dinheiro.ts';
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

/** Confere os dados comuns a criar e editar. Devolve a mensagem de erro, ou null. */
function validarDados(estado: Estado, d: DadosParcelamento): string | null {
  if (d.descricao.trim() === '') return 'Informe a descrição.';
  if (!categoriaPorId(estado, d.categoriaId)) return 'Escolha uma categoria.';
  if (!Number.isInteger(d.n) || d.n < 2 || d.n > MAXIMO_PARCELAS) {
    return `O número de parcelas deve ser de 2 a ${String(MAXIMO_PARCELAS)}.`;
  }
  if (!ehPercentualValido(d.pctA)) return 'Percentual inválido.';
  if (!ehDataValida(d.dataCompra)) return 'Data inválida.';
  if (!ehCompetencia(d.primeiraCompetencia)) return 'Mês da 1ª parcela inválido.';
  return null;
}

/** Lança a compra parcelada e gera TODAS as parcelas de uma vez, cada uma no seu mês. */
export function criarParcelamento(estado: Estado, d: DadosParcelamento, ctx: Contexto): Resultado {
  const erro = validarDados(estado, d);
  if (erro) return invalido(erro);

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

/** Marca as alterações feitas pela edição do parcelamento (o feed mostra uma linha só). */
export const MOTIVO_EDICAO = 'parcelamento-editado';

/**
 * Edição completa do parcelamento (tela "Editar parcelamento"). Regras:
 * - Parcelas de meses já acertados nunca mudam ("travadas").
 * - Descrição, categoria, quem pagou e divisão valem para todas as parcelas dos meses abertos.
 * - Mudou o valor ou o nº de parcelas: as parcelas dos meses abertos são refeitas. Pelo total,
 *   o que falta (total − parcelas travadas) é dividido entre elas, e os centavos que sobram vão
 *   para a primeira delas. Pela parcela, cada uma passa a ter esse valor.
 * - Menos parcelas: as que sobram (em mês aberto) são excluídas. Mais parcelas: as novas são
 *   criadas nos meses seguintes.
 * - Mudou a data da compra ou o mês da 1ª parcela: as parcelas abertas mudam de data/mês.
 * - Parcelamento cancelado: só dá para mudar descrição, categoria, quem pagou e divisão.
 */
export function editarParcelamento(estado: Estado, id: string, d: DadosParcelamento, ctx: Contexto): Resultado {
  const p = estado.parcelamentos.find((x) => x.id === id);
  if (!p) return invalido('Parcelamento não encontrado.');
  const erro = validarDados(estado, d);
  if (erro) return invalido(erro);
  if (d.valorTotal === undefined && d.valorParcela === undefined) return invalido('Informe o valor.');

  const porNumero = new Map<number, Despesa>();
  for (const x of estado.despesas) {
    if (x.origem.tipo === 'parcela' && x.origem.id === id) porNumero.set(x.origem.k, x);
  }
  const travada = (x: Despesa | undefined): boolean => x !== undefined && mesFechado(estado, x.livro, x.competencia);
  const travadas = [...porNumero.entries()].filter(([, x]) => travada(x));
  const maiorTravada = Math.max(0, ...travadas.map(([k]) => k));
  const somaTravadas = travadas.reduce((s, [, x]) => s + (x.excluida ? 0 : x.valor), 0);

  const mudouN = d.n !== p.n;
  const mudouDatas = d.dataCompra !== p.dataCompra || d.primeiraCompetencia !== p.primeiraCompetencia;
  const mudouValor = d.valorParcela !== undefined || d.valorTotal !== p.valorTotal;
  if (p.status === 'cancelado' && (mudouN || mudouDatas || mudouValor)) {
    return invalido('Este parcelamento foi cancelado: só dá para mudar a descrição, a categoria, quem pagou e a divisão.');
  }
  if (d.n < maiorTravada) {
    return invalido(`Já há parcelas em meses acertados: o parcelamento precisa ter pelo menos ${String(maiorTravada)} parcelas.`);
  }
  if (travadas.length > 0 && d.primeiraCompetencia !== p.primeiraCompetencia) {
    return invalido('Já há parcelas em meses acertados: o mês da 1ª parcela não pode mudar.');
  }

  const livres: number[] = [];
  for (let k = 1; k <= d.n; k++) if (!travada(porNumero.get(k))) livres.push(k);

  // Valores novos (só quando o valor ou o nº de parcelas mudou).
  let valores: Map<number, Centavos> | null = null;
  let total = p.valorTotal;
  if (mudouValor || mudouN) {
    let lista: Centavos[];
    if (d.valorParcela !== undefined) {
      if (!ehCentavosValidos(d.valorParcela) || d.valorParcela <= 0) return invalido('Informe o valor.');
      lista = livres.map(() => d.valorParcela ?? 0);
      total = somaTravadas + d.valorParcela * livres.length;
    } else {
      const restante = (d.valorTotal ?? 0) - somaTravadas;
      if (livres.length === 0) {
        if (restante !== 0) return invalido('Todas as parcelas já estão em meses acertados: o total não pode mudar.');
        lista = [];
      } else if (!ehCentavosValidos(restante) || restante < livres.length) {
        return invalido(`O total precisa ser maior que o que já foi acertado (${formatarReais(somaTravadas)}).`);
      } else {
        lista = valoresDasParcelas(restante, livres.length);
      }
      total = d.valorTotal ?? total;
    }
    if (!ehCentavosValidos(total) || total > VALOR_MAXIMO) return invalido('Valor inválido.');
    valores = new Map(livres.map((k, i) => [k, lista[i] ?? 0]));
  }

  const descricao = d.descricao.trim();
  const dia = diaDaData(d.dataCompra);
  const mesDe = (k: number): Competencia => somarMeses(d.primeiraCompetencia, k - 1);
  const eventos: Evento[] = [];
  const maiorK = Math.max(d.n, ...porNumero.keys());

  for (let k = 1; k <= maiorK; k++) {
    const atual = porNumero.get(k);
    if (travada(atual)) continue;
    if (k > d.n) {
      if (atual && !atual.excluida) {
        eventos.push(novoEvento(ctx, 'alterar', 'despesa', atual.id, { excluida: true, motivo: MOTIVO_EDICAO }));
      }
      continue;
    }
    const valor = valores?.get(k);
    if (!atual || atual.excluida) {
      // Parcela nova (ou excluída antes): só nasce quando os valores foram refeitos.
      if (valor === undefined) continue;
      const c = mesDe(k);
      if (mesFechado(estado, LIVRO_CASA, c)) {
        return invalido(`A parcela ${String(k)}/${String(d.n)} cairia em ${nomeDaCompetencia(c)}, que já foi acertado.`);
      }
      const campos = camposNovaDespesa(
        { valor, descricao, data: dataNoMes(c, dia), competencia: c, categoriaId: d.categoriaId, pagador: d.pagador, pctA: d.pctA, pctPadrao: d.pctPadrao },
        { tipo: 'parcela', id, k, n: d.n },
      );
      eventos.push(
        atual
          ? novoEvento(ctx, 'alterar', 'despesa', atual.id, { ...campos, motivo: MOTIVO_EDICAO })
          : novoEvento(ctx, 'criar', 'despesa', idParcela(id, k), campos),
      );
      continue;
    }

    const campos: Record<string, ValorCampo> = {};
    if (valor !== undefined && valor !== atual.valor) campos['valor'] = valor;
    if (mudouDatas) {
      const c = mesDe(k);
      if (c !== atual.competencia && mesFechado(estado, LIVRO_CASA, c)) {
        return invalido(`A parcela ${String(k)}/${String(d.n)} cairia em ${nomeDaCompetencia(c)}, que já foi acertado.`);
      }
      if (c !== atual.competencia) campos['competencia'] = c;
      if (dataNoMes(c, dia) !== atual.data) campos['data'] = dataNoMes(c, dia);
    }
    if (descricao !== p.descricao && descricao !== atual.descricao) campos['descricao'] = descricao;
    if (d.categoriaId !== p.categoriaId && d.categoriaId !== atual.categoriaId) campos['categoriaId'] = d.categoriaId;
    if (d.pagador !== p.pagador && d.pagador !== atual.pagador) campos['pagador'] = d.pagador;
    if (d.pctA !== p.pctA && d.pctA !== atual.pctA) {
      campos['pctA'] = d.pctA;
      campos['pctPadrao'] = d.pctPadrao;
    }
    if (atual.origem.tipo === 'parcela' && atual.origem.n !== d.n) campos['parcelaN'] = d.n;
    if (Object.keys(campos).length > 0) {
      eventos.push(novoEvento(ctx, 'alterar', 'despesa', atual.id, { ...campos, motivo: MOTIVO_EDICAO }));
    }
  }

  const novos: Record<string, ValorCampo> = {
    descricao,
    categoriaId: d.categoriaId,
    pagador: d.pagador,
    pctA: d.pctA,
    n: d.n,
    valorTotal: total,
    dataCompra: d.dataCompra,
    primeiraCompetencia: d.primeiraCompetencia,
  };
  const antigos: Record<string, ValorCampo> = { ...p };
  const mudou: Record<string, ValorCampo> = {};
  for (const [k, v] of Object.entries(novos)) if (antigos[k] !== v) mudou[k] = v;
  if (Object.keys(mudou).length > 0) eventos.push(novoEvento(ctx, 'alterar', 'parcelamento', id, mudou));
  return sucesso(eventos);
}
