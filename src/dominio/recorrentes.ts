import { competenciaDaData, dataNoMes, ehCompetencia, mesesEntre } from './competencia.ts';
import { invalido, novoEvento, sucesso, type Contexto, type Resultado } from './contexto.ts';
import { camposNovaDespesa } from './despesas.ts';
import { ehCentavosValidos, type Centavos } from './dinheiro.ts';
import type { Evento, ValorCampo } from './eventos.ts';
import { categoriaPorId, mesFechado, type Estado, type Recorrente } from './estado.ts';
import { ehPercentualValido } from './percentual.ts';
import { LIVRO_CASA, type Competencia, type Pessoa, type PontosBase } from './tipos.ts';

/**
 * Id DETERMINÍSTICO da ocorrência de uma recorrente num mês. Dois aparelhos gerando offline
 * chegam ao mesmo id, e a projeção ignora a criação repetida (vale a primeira).
 */
export function idOcorrencia(recorrenteId: string, c: Competencia): string {
  return `rec_${recorrenteId}_${c}`;
}

export interface DadosRecorrente {
  readonly descricao: string;
  readonly categoriaId: string;
  readonly pagador: Pessoa;
  readonly tipoValor: 'fixo' | 'variavel';
  readonly valor: Centavos;
  readonly dia: number;
  readonly inicio: Competencia;
  readonly fim: Competencia | null;
  readonly pctA: PontosBase | null;
}

function validar(estado: Estado, d: DadosRecorrente): string | null {
  if (d.descricao.trim() === '') return 'Informe a descrição.';
  if (!categoriaPorId(estado, d.categoriaId)) return 'Escolha uma categoria.';
  if (d.tipoValor === 'fixo' && (!ehCentavosValidos(d.valor) || d.valor <= 0)) return 'Informe o valor.';
  if (!Number.isInteger(d.dia) || d.dia < 1 || d.dia > 31) return 'Dia do mês inválido.';
  if (!ehCompetencia(d.inicio)) return 'Mês de início inválido.';
  if (d.fim !== null && (!ehCompetencia(d.fim) || d.fim < d.inicio)) return 'Mês de fim inválido.';
  if (d.pctA !== null && !ehPercentualValido(d.pctA)) return 'Percentual inválido.';
  return null;
}

function campos(d: DadosRecorrente): Record<string, ValorCampo> {
  return {
    descricao: d.descricao.trim(),
    categoriaId: d.categoriaId,
    pagador: d.pagador,
    tipoValor: d.tipoValor,
    valor: d.tipoValor === 'fixo' ? d.valor : 0,
    dia: d.dia,
    inicio: d.inicio,
    fim: d.fim ?? '',
    pctA: d.pctA,
  };
}

/** Cria a recorrente e já gera as ocorrências que faltam até o mês corrente. */
export function criarRecorrente(estado: Estado, d: DadosRecorrente, ctx: Contexto): Resultado {
  const erro = validar(estado, d);
  if (erro) return invalido(erro);
  const id = ctx.novoId();
  const criar = novoEvento(ctx, 'criar', 'recorrente', id, { ...campos(d), ativa: true, excluida: false });
  const recorrente: Recorrente = {
    id,
    ...d,
    descricao: d.descricao.trim(),
    valor: d.tipoValor === 'fixo' ? d.valor : 0,
    ativa: true,
    excluida: false,
  };
  return sucesso([criar, ...eventosDeOcorrencias(estado, [recorrente], competenciaDaData(ctx.hoje), ctx)]);
}

export function alterarRecorrente(estado: Estado, id: string, d: DadosRecorrente, ctx: Contexto): Resultado {
  const atual = estado.recorrentes.find((r) => r.id === id);
  if (!atual || atual.excluida) return invalido('Recorrente não encontrada.');
  const erro = validar(estado, d);
  if (erro) return invalido(erro);
  const novos = campos(d);
  const antigos = campos(atual);
  const mudou: Record<string, ValorCampo> = {};
  for (const [k, v] of Object.entries(novos)) if (antigos[k] !== v) mudou[k] = v;
  return sucesso(Object.keys(mudou).length ? [novoEvento(ctx, 'alterar', 'recorrente', id, mudou)] : []);
}

/** Pausar: para de gerar. Retomar: volta a gerar a partir do mês corrente (sem "atrasados"). */
export function pausarRecorrente(estado: Estado, id: string, pausar: boolean, ctx: Contexto): Resultado {
  const atual = estado.recorrentes.find((r) => r.id === id);
  if (!atual || atual.excluida) return invalido('Recorrente não encontrada.');
  if (pausar) return sucesso([novoEvento(ctx, 'alterar', 'recorrente', id, { ativa: false })]);
  const mes = competenciaDaData(ctx.hoje);
  const inicio = atual.inicio > mes ? atual.inicio : mes;
  return sucesso([novoEvento(ctx, 'alterar', 'recorrente', id, { ativa: true, inicio })]);
}

/** Encerrar: a última ocorrência é a do mês informado. */
export function encerrarRecorrente(estado: Estado, id: string, ultimoMes: Competencia, ctx: Contexto): Resultado {
  const atual = estado.recorrentes.find((r) => r.id === id);
  if (!atual || atual.excluida) return invalido('Recorrente não encontrada.');
  if (!ehCompetencia(ultimoMes)) return invalido('Mês inválido.');
  return sucesso([novoEvento(ctx, 'alterar', 'recorrente', id, { fim: ultimoMes })]);
}

export function excluirRecorrente(estado: Estado, id: string, ctx: Contexto): Resultado {
  const atual = estado.recorrentes.find((r) => r.id === id);
  if (!atual || atual.excluida) return invalido('Recorrente não encontrada.');
  return sucesso([novoEvento(ctx, 'alterar', 'recorrente', id, { excluida: true, ativa: false })]);
}

export interface OcorrenciaPendente {
  readonly recorrente: Recorrente;
  readonly competencia: Competencia;
}

/**
 * Ocorrências que faltam gerar até o mês "ate". Pula meses fechados e ocorrências que já
 * existem — inclusive as que alguém excluiu (não "ressuscitam").
 */
export function ocorrenciasPendentes(
  estado: Estado,
  recorrentes: readonly Recorrente[],
  ate: Competencia,
): OcorrenciaPendente[] {
  const existentes = new Set(estado.despesas.map((d) => d.id));
  const lista: OcorrenciaPendente[] = [];
  for (const r of recorrentes) {
    if (!r.ativa || r.excluida || !ehCompetencia(r.inicio)) continue;
    const fim = r.fim !== null && r.fim < ate ? r.fim : ate;
    for (const c of mesesEntre(r.inicio, fim)) {
      if (existentes.has(idOcorrencia(r.id, c))) continue;
      if (mesFechado(estado, LIVRO_CASA, c)) continue;
      lista.push({ recorrente: r, competencia: c });
    }
  }
  return lista;
}

function eventosDeOcorrencias(
  estado: Estado,
  recorrentes: readonly Recorrente[],
  ate: Competencia,
  ctx: Contexto,
): Evento[] {
  return ocorrenciasPendentes(estado, recorrentes, ate).map(({ recorrente: r, competencia: c }) => {
    const categoria = categoriaPorId(estado, r.categoriaId);
    const variavel = r.tipoValor === 'variavel';
    return novoEvento(
      ctx,
      'criar',
      'despesa',
      idOcorrencia(r.id, c),
      camposNovaDespesa(
        {
          valor: variavel ? 0 : r.valor,
          descricao: r.descricao,
          data: dataNoMes(c, r.dia),
          competencia: c,
          categoriaId: r.categoriaId,
          pagador: r.pagador,
          pctA: r.pctA ?? categoria?.pctA ?? 5000,
          pctPadrao: r.pctA === null,
          status: variavel ? 'aguardando' : 'normal',
        },
        { tipo: 'recorrente', id: r.id },
      ),
    );
  });
}

/** Ao abrir o app: gera as ocorrências que faltam até o mês corrente (especificação 4.4). */
export function gerarRecorrentesPendentes(estado: Estado, ctx: Contexto): Evento[] {
  return eventosDeOcorrencias(estado, estado.recorrentes, competenciaDaData(ctx.hoje), ctx);
}
