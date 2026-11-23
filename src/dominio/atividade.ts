import { formatarData, nomeDaCompetencia } from './competencia.ts';
import { formatarReais } from './dinheiro.ts';
import { chaveEntidade, type Evento, type ValorCampo } from './eventos.ts';
import { nomeDe, type Config } from './estado.ts';
import { instanteDoHlc } from './hlc.ts';
import { formatarPercentual } from './percentual.ts';
import { ordenarSemRepetir } from './projecao.ts';

/**
 * Feed de atividade (tela 8) e linha do tempo de cada despesa.
 * Exemplo: "Bruno alterou Mercado: R$ 120,00 → R$ 150,00".
 */
export interface ItemAtividade {
  readonly eventoId: string;
  readonly instante: number;
  readonly hlc: string;
  readonly autor: string;
  /** Quem fez (A ou B), para filtrar. */
  readonly pessoa: Evento['autor'];
  readonly entidade: Evento['entidade'];
  readonly entidadeId: string;
  readonly textos: readonly string[];
}

type Campos = Record<string, ValorCampo>;

interface Lote {
  tipo: 'importou' | 'corrigiu';
  indice: number;
  despesas: number;
  meses: number;
}

function reais(v: ValorCampo | undefined): string {
  return typeof v === 'number' ? formatarReais(v) : '—';
}

function pct(v: ValorCampo | undefined): string {
  return typeof v === 'number' ? formatarPercentual(v) : '—';
}

function texto(v: ValorCampo | undefined): string {
  return typeof v === 'string' ? v : '';
}

function nomeCategoria(cats: Map<string, Campos>, id: ValorCampo | undefined): string {
  return texto(cats.get(texto(id))?.['nome']) || 'sem categoria';
}

/** Monta o feed, do mais recente para o mais antigo. */
export function gerarAtividade(eventos: readonly Evento[], config: Config): ItemAtividade[] {
  const ordenados = ordenarSemRepetir(eventos);
  const estado = new Map<string, Campos>();
  const categorias = new Map<string, Campos>();
  const itens: ItemAtividade[] = [];
  const pessoa = (v: ValorCampo | undefined): string => (v === 'A' || v === 'B' ? nomeDe(config, v) : '—');
  // Importação do Tricount: centenas de eventos seguidos viram uma linha só (e a correção também).
  let lote = null as Lote | null;

  for (const e of ordenados) {
    const chave = chaveEntidade(e.entidade, e.entidadeId);
    const antes = estado.get(chave);
    if (e.tipo === 'criar' && antes) continue; // criação repetida: ignorada, como na projeção
    if (e.tipo === 'alterar' && !antes) continue;
    const depois = { ...(antes ?? {}), ...e.campos };
    estado.set(chave, depois);
    if (e.entidade === 'categoria') categorias.set(e.entidadeId, depois);

    const quem = nomeDe(config, e.autor);
    const importado = !antes && (depois['origemTipo'] === 'importada' || (e.entidade === 'fechamento' && depois['importado'] === true));
    const tipoLote = e.campos['reimportacao'] === true ? 'corrigiu' : importado ? 'importou' : null;
    const textos = tipoLote === 'corrigiu' ? [textoDoLote('corrigiu', quem, 1, 0)] : descrever(e, antes, depois, quem, categorias, pessoa);
    if (textos.length === 0) continue;
    const anterior = lote ? itens[lote.indice] : undefined;
    if (tipoLote && lote?.tipo === tipoLote && anterior && lote.indice === itens.length - 1 && anterior.pessoa === e.autor) {
      if (e.entidade === 'fechamento') lote.meses += 1;
      else lote.despesas += 1;
      itens[lote.indice] = { ...anterior, textos: [textoDoLote(lote.tipo, quem, lote.despesas, lote.meses)] };
      continue;
    }
    lote = tipoLote
      ? { tipo: tipoLote, indice: itens.length, despesas: e.entidade === 'fechamento' ? 0 : 1, meses: e.entidade === 'fechamento' ? 1 : 0 }
      : null;
    itens.push({
      eventoId: e.id,
      instante: instanteDoHlc(e.hlc),
      hlc: e.hlc,
      autor: quem,
      pessoa: e.autor,
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      textos,
    });
  }
  return itens.reverse();
}

function textoDoLote(tipo: 'importou' | 'corrigiu', quem: string, despesas: number, meses: number): string {
  if (tipo === 'corrigiu') {
    const n = despesas + meses;
    return `${quem} corrigiu a importação do Tricount: ${String(n)} ${n === 1 ? 'mudança' : 'mudanças'}`;
  }
  const partes = [
    despesas > 0 ? `${String(despesas)} ${despesas === 1 ? 'despesa' : 'despesas'}` : '',
    meses > 0 ? `${String(meses)} ${meses === 1 ? 'mês acertado' : 'meses acertados'}` : '',
  ].filter(Boolean);
  return `${quem} importou do Tricount: ${partes.join(' e ')}`;
}

function descrever(
  e: Evento,
  antes: Campos | undefined,
  depois: Campos,
  quem: string,
  categorias: Map<string, Campos>,
  pessoa: (v: ValorCampo | undefined) => string,
): string[] {
  const nome = texto(depois['descricao']) || texto(depois['nome']);
  switch (e.entidade) {
    case 'despesa':
      return descreverDespesa(e, antes, depois, quem, categorias, pessoa);
    case 'categoria':
      if (!antes) return [`${quem} criou a categoria ${nome}`];
      return Object.keys(e.campos).flatMap((k) => {
        if (k === 'pctA') return [`${quem} alterou a divisão de ${nome}: ${pct(antes[k])} → ${pct(depois[k])}`];
        if (k === 'nome') return [`${quem} renomeou a categoria ${texto(antes[k])} para ${nome}`];
        if (k === 'ativa') return [depois[k] ? `${quem} reativou a categoria ${nome}` : `${quem} arquivou a categoria ${nome}`];
        return [];
      });
    case 'recorrente':
      if (!antes) return [`${quem} criou a recorrente ${nome}`];
      if (e.campos['excluida'] === true) return [`${quem} excluiu a recorrente ${nome}`];
      if (e.campos['ativa'] === false) return [`${quem} pausou a recorrente ${nome}`];
      if (e.campos['ativa'] === true) return [`${quem} retomou a recorrente ${nome}`];
      if ('fim' in e.campos && texto(e.campos['fim'])) {
        return [`${quem} encerrou a recorrente ${nome} em ${nomeDaCompetencia(texto(e.campos['fim']))}`];
      }
      return [`${quem} alterou a recorrente ${nome}`];
    case 'parcelamento':
      if (!antes) {
        return [`${quem} lançou ${nome} em ${String(depois['n'])}x (total ${reais(depois['valorTotal'])})`];
      }
      if (e.campos['status'] === 'cancelado') return [`${quem} cancelou as parcelas restantes de ${nome}`];
      return [`${quem} alterou o parcelamento ${nome}`];
    case 'fechamento': {
      const mes = nomeDaCompetencia(texto(depois['competencia']));
      if (depois['status'] === 'aberto') return [`${quem} reabriu ${mes}`];
      if (!antes && depois['importado'] === true) return [`${quem} importou o acerto de ${mes} do Tricount`];
      const de = depois['transferenciaDe'];
      const valor = depois['valorTransferencia'];
      if ((de === 'A' || de === 'B') && typeof valor === 'number' && valor > 0) {
        const para = de === 'A' ? 'B' : 'A';
        return [`${quem} acertou ${mes}: ${pessoa(de)} transfere ${formatarReais(valor)} para ${pessoa(para)}`];
      }
      return [`${quem} acertou ${mes}: ninguém devia nada`];
    }
    case 'config':
      return antes ? [`${quem} alterou os nomes para ${texto(depois['nomeA'])} e ${texto(depois['nomeB'])}`] : [];
  }
}

function descreverDespesa(
  e: Evento,
  antes: Campos | undefined,
  depois: Campos,
  quem: string,
  categorias: Map<string, Campos>,
  pessoa: (v: ValorCampo | undefined) => string,
): string[] {
  const nome = texto(depois['descricao']);
  if (!antes) {
    if (depois['origemTipo'] === 'parcela') return []; // aparece como "lançou X em Nx"
    if (depois['origemTipo'] === 'recorrente') {
      const mes = nomeDaCompetencia(texto(depois['competencia']));
      return depois['status'] === 'aguardando'
        ? [`${nome} de ${mes} foi gerada e aguarda o valor`]
        : [`${nome} de ${mes} foi gerada automaticamente: ${reais(depois['valor'])}`];
    }
    if (depois['origemTipo'] === 'importada') return [`${quem} importou ${nome} do Tricount: ${reais(depois['valor'])}`];
    return [`${quem} lançou ${nome}: ${reais(depois['valor'])}`];
  }
  if (e.campos['excluida'] === true) {
    // Exclusões em lote do "cancelar parcelas restantes" já aparecem numa linha só.
    if (e.campos['motivo'] === 'parcelamento-cancelado') return [];
    return [`${quem} excluiu ${nome} (${reais(depois['valor'])})`];
  }

  const textos: string[] = [];
  for (const k of Object.keys(e.campos)) {
    const a = antes[k];
    const d = depois[k];
    if (a === d) continue;
    switch (k) {
      case 'valor':
        textos.push(
          antes['status'] === 'aguardando'
            ? `${quem} informou o valor de ${nome}: ${reais(d)}`
            : `${quem} alterou ${nome}: ${reais(a)} → ${reais(d)}`,
        );
        break;
      case 'descricao':
        textos.push(`${quem} renomeou ${texto(a)} para ${texto(d)}`);
        break;
      case 'categoriaId':
        textos.push(`${quem} mudou a categoria de ${nome}: ${nomeCategoria(categorias, a)} → ${nomeCategoria(categorias, d)}`);
        break;
      case 'pagador':
        textos.push(`${quem} mudou quem pagou ${nome}: ${pessoa(a)} → ${pessoa(d)}`);
        break;
      case 'pctA':
        textos.push(`${quem} mudou a divisão de ${nome}: ${pct(a)} → ${pct(d)}`);
        break;
      case 'data':
        textos.push(`${quem} mudou a data de ${nome}: ${formatarData(texto(a))} → ${formatarData(texto(d))}`);
        break;
      case 'competencia':
        textos.push(`${quem} moveu ${nome} para ${nomeDaCompetencia(texto(d))}`);
        break;
    }
  }
  return textos;
}
