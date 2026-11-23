import { competenciaDaData, dataNoMes, ehCompetencia, mesesEntre } from './competencia.ts';
import { invalido, novoEvento, sucesso, type Contexto, type Resultado } from './contexto.ts';
import { alterarDespesa, camposNovaDespesa, type DadosDespesa } from './despesas.ts';
import { ehCentavosValidos, type Centavos } from './dinheiro.ts';
import type { Evento, ValorCampo } from './eventos.ts';
import { categoriaPorId, mesFechado, type Despesa, type Estado, type Recorrente } from './estado.ts';
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
  if (!Number.isInteger(d.dia) || d.dia < 1 || d.dia > 31) return 'Informe o dia do vencimento (de 1 a 31).';
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

/**
 * Despesas já geradas por esta recorrente em meses ainda não acertados. São as que a edição
 * completa pode atualizar junto (meses fechados nunca mudam).
 */
export function ocorrenciasEmAberto(estado: Estado, recorrenteId: string): Despesa[] {
  return estado.despesas
    .filter(
      (d) =>
        !d.excluida &&
        d.origem.tipo === 'recorrente' &&
        d.origem.id === recorrenteId &&
        !mesFechado(estado, d.livro, d.competencia),
    )
    .sort((a, b) => (a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : 0));
}

type Mudancas = { -readonly [K in keyof DadosDespesa]?: DadosDespesa[K] };

/**
 * O que muda numa ocorrência já lançada quando a recorrente é editada. Só mexe no que a pessoa
 * NÃO mudou à mão: cada campo só é atualizado se ainda estiver igual ao que a recorrente antiga
 * gerou. Ex.: se o aluguel de novembro foi editado para R$ 2.050, mudar a recorrente de
 * R$ 2.000 para R$ 2.100 não mexe nesse mês.
 */
function mudancasNaOcorrencia(estado: Estado, d: Despesa, antiga: Recorrente, nova: DadosRecorrente): Mudancas {
  const m: Mudancas = {};
  const descricao = nova.descricao.trim();
  if (descricao !== antiga.descricao && d.descricao === antiga.descricao) m.descricao = descricao;
  if (nova.pagador !== antiga.pagador && d.pagador === antiga.pagador) m.pagador = nova.pagador;
  const categoriaMudou = nova.categoriaId !== antiga.categoriaId;
  if (categoriaMudou && d.categoriaId === antiga.categoriaId) m.categoriaId = nova.categoriaId;

  // Divisão: a ocorrência segue a recorrente se ainda usa o % que ela deu.
  const pctSeguia = antiga.pctA === null ? d.pctPadrao : d.pctA === antiga.pctA;
  const pctMudou = nova.pctA !== antiga.pctA || (nova.pctA === null && categoriaMudou);
  if (pctMudou && pctSeguia) {
    const pctA = nova.pctA ?? categoriaPorId(estado, nova.categoriaId)?.pctA ?? d.pctA;
    if (pctA !== d.pctA) m.pctA = pctA;
    if (d.pctPadrao !== (nova.pctA === null)) m.pctPadrao = nova.pctA === null;
  }

  if (nova.dia !== antiga.dia && d.data === dataNoMes(d.competencia, antiga.dia)) {
    m.data = dataNoMes(d.competencia, nova.dia);
  }

  if (nova.tipoValor === 'fixo') {
    const seguiaValor =
      antiga.tipoValor === 'fixo' ? d.status === 'normal' && d.valor === antiga.valor : d.status === 'aguardando';
    if (seguiaValor && d.valor !== nova.valor) m.valor = nova.valor;
  }
  return m;
}

/**
 * Edição completa (tela "Editar recorrente"). Muda a recorrente e, se "aplicarNasLancadas",
 * também as despesas que ela já lançou em meses ainda não acertados:
 * - atualiza os campos que mudaram (menos o que foi mudado à mão naquela despesa);
 * - exclui as que ficaram fora do novo período (início/fim).
 * Depois, gera na hora os meses que faltam até o mês corrente (ex.: início mais cedo).
 */
export function editarRecorrente(
  estado: Estado,
  id: string,
  d: DadosRecorrente,
  aplicarNasLancadas: boolean,
  ctx: Contexto,
): Resultado {
  const r = alterarRecorrente(estado, id, d, ctx);
  const antiga = estado.recorrentes.find((x) => x.id === id);
  if (!r.ok || !antiga) return r;
  const eventos: Evento[] = [...r.eventos];

  if (aplicarNasLancadas) {
    for (const o of ocorrenciasEmAberto(estado, id)) {
      if (o.competencia < d.inicio || (d.fim !== null && o.competencia > d.fim)) {
        eventos.push(novoEvento(ctx, 'alterar', 'despesa', o.id, { excluida: true }));
        continue;
      }
      const m = mudancasNaOcorrencia(estado, o, antiga, d);
      if (Object.keys(m).length === 0) continue;
      const res = alterarDespesa(estado, o.id, m, ctx);
      if (res.ok) eventos.push(...res.eventos);
    }
  }

  const nova: Recorrente = { ...antiga, ...d, descricao: d.descricao.trim(), valor: d.tipoValor === 'fixo' ? d.valor : 0 };
  eventos.push(...eventosDeOcorrencias(estado, [nova], competenciaDaData(ctx.hoje), ctx));
  return sucesso(eventos);
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
