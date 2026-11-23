import { ehCompetencia, ehDataValida, somarMeses } from './competencia.ts';
import {
  invalido,
  mesFechadoFalha,
  novoEvento,
  sucesso,
  type Contexto,
  type Resultado,
} from './contexto.ts';
import { ehCentavosValidos, type Centavos } from './dinheiro.ts';
import { VALOR_MAXIMO } from './divisao.ts';
import type { Campos, ValorCampo } from './eventos.ts';
import {
  categoriaPorId,
  despesaPorId,
  fechamentoDe,
  mesFechado,
  type Estado,
  type Origem,
  type StatusDespesa,
} from './estado.ts';
import { ehPercentualValido } from './percentual.ts';
import { ehPessoa, LIVRO_CASA, type Competencia, type DataISO, type Pessoa, type PontosBase } from './tipos.ts';

export const TAMANHO_MAXIMO_DESCRICAO = 120;

export interface DadosDespesa {
  readonly valor: Centavos;
  readonly descricao: string;
  readonly data: DataISO;
  readonly competencia: Competencia;
  readonly categoriaId: string;
  readonly pagador: Pessoa;
  readonly pctA: PontosBase;
  readonly pctPadrao: boolean;
  readonly status?: StatusDespesa;
}

/** Valida os dados de uma despesa. Devolve a mensagem de erro, ou null se estiver tudo certo. */
export function validarDespesa(estado: Estado, d: DadosDespesa): string | null {
  const status = d.status ?? 'normal';
  if (!ehCentavosValidos(d.valor) || d.valor > VALOR_MAXIMO || d.valor < 0) return 'Valor inválido.';
  if (status === 'normal' && d.valor === 0) return 'Informe o valor.';
  const descricao = d.descricao.trim();
  if (descricao === '') return 'Informe a descrição.';
  if (descricao.length > TAMANHO_MAXIMO_DESCRICAO) return 'Descrição longa demais.';
  if (!ehDataValida(d.data)) return 'Data inválida.';
  if (!ehCompetencia(d.competencia)) return 'Mês de competência inválido.';
  if (!categoriaPorId(estado, d.categoriaId)) return 'Escolha uma categoria.';
  if (!ehPessoa(d.pagador)) return 'Informe quem pagou.';
  if (!ehPercentualValido(d.pctA)) return 'Percentual inválido.';
  return null;
}

function camposDaOrigem(origem: Origem): Record<string, ValorCampo> {
  switch (origem.tipo) {
    case 'manual':
      return { origemTipo: 'manual' };
    case 'importada':
      return { origemTipo: 'importada' };
    case 'recorrente':
      return { origemTipo: 'recorrente', origemId: origem.id };
    case 'parcela':
      return { origemTipo: 'parcela', origemId: origem.id, parcelaK: origem.k, parcelaN: origem.n };
  }
}

/** Campos do evento de criação de uma despesa (usado também por recorrentes e parcelas). */
export function camposNovaDespesa(d: DadosDespesa, origem: Origem, livro = LIVRO_CASA): Campos {
  return {
    livro,
    valor: d.valor,
    descricao: d.descricao.trim(),
    data: d.data,
    competencia: d.competencia,
    categoriaId: d.categoriaId,
    pagador: d.pagador,
    pctA: d.pctA,
    pctPadrao: d.pctPadrao,
    status: d.status ?? 'normal',
    excluida: false,
    ...camposDaOrigem(origem),
  };
}

export function criarDespesa(estado: Estado, dados: DadosDespesa, ctx: Contexto, livro = LIVRO_CASA): Resultado {
  const erro = validarDespesa(estado, dados);
  if (erro) return invalido(erro);
  if (mesFechado(estado, livro, dados.competencia)) return mesFechadoFalha(dados.competencia);
  const id = ctx.novoId();
  return sucesso([novoEvento(ctx, 'criar', 'despesa', id, camposNovaDespesa(dados, { tipo: 'manual' }, livro))]);
}

/**
 * Despesa de mês fechado que NÃO entrou na conta do fechamento (chegou depois, pela
 * sincronização, ou estava aguardando valor). Só essas podem ser movidas para o mês aberto.
 */
export function ficouForaDoFechamento(estado: Estado, despesaId: string): boolean {
  const d = despesaPorId(estado, despesaId);
  if (!d) return false;
  const f = fechamentoDe(estado, d.livro, d.competencia);
  if (f?.status !== 'fechado') return false;
  return !f.despesasContadas.includes(d.id);
}

/** Altera só os campos que mudaram. Bloqueia mudanças em mês fechado (de origem ou destino). */
export function alterarDespesa(
  estado: Estado,
  id: string,
  mudancas: Partial<DadosDespesa>,
  ctx: Contexto,
): Resultado {
  const atual = despesaPorId(estado, id);
  if (!atual || atual.excluida) return invalido('Despesa não encontrada.');

  const preenchendoValor = atual.status === 'aguardando' && mudancas.valor !== undefined && mudancas.valor > 0;
  const novo: DadosDespesa = {
    valor: mudancas.valor ?? atual.valor,
    descricao: mudancas.descricao ?? atual.descricao,
    data: mudancas.data ?? atual.data,
    competencia: mudancas.competencia ?? atual.competencia,
    categoriaId: mudancas.categoriaId ?? atual.categoriaId,
    pagador: mudancas.pagador ?? atual.pagador,
    pctA: mudancas.pctA ?? atual.pctA,
    pctPadrao: mudancas.pctPadrao ?? atual.pctPadrao,
    status: preenchendoValor ? 'normal' : (mudancas.status ?? atual.status),
  };
  const erro = validarDespesa(estado, novo);
  if (erro) return invalido(erro);

  const campos: Record<string, ValorCampo> = {};
  const novoTrimado = { ...novo, descricao: novo.descricao.trim() };
  for (const k of Object.keys(novoTrimado) as (keyof DadosDespesa)[]) {
    const valor = novoTrimado[k];
    if (valor !== undefined && valor !== atual[k]) campos[k] = valor;
  }
  if (Object.keys(campos).length === 0) return sucesso([]);

  const podeSairDoFechado = ficouForaDoFechamento(estado, id);
  if (mesFechado(estado, atual.livro, atual.competencia) && !podeSairDoFechado) {
    return mesFechadoFalha(atual.competencia);
  }
  if (novo.competencia !== atual.competencia && mesFechado(estado, atual.livro, novo.competencia)) {
    return mesFechadoFalha(novo.competencia);
  }
  if (podeSairDoFechado && novo.competencia === atual.competencia) {
    return mesFechadoFalha(atual.competencia);
  }

  return sucesso([novoEvento(ctx, 'alterar', 'despesa', id, campos)]);
}

export function excluirDespesa(estado: Estado, id: string, ctx: Contexto): Resultado {
  const atual = despesaPorId(estado, id);
  if (!atual || atual.excluida) return invalido('Despesa não encontrada.');
  if (mesFechado(estado, atual.livro, atual.competencia) && !ficouForaDoFechamento(estado, id)) {
    return mesFechadoFalha(atual.competencia);
  }
  return sucesso([novoEvento(ctx, 'alterar', 'despesa', id, { excluida: true })]);
}

/** Primeiro mês não fechado depois de "c" (o "mês em aberto" para onde mover). */
export function proximoMesAberto(estado: Estado, livro: string, c: Competencia): Competencia {
  let atual = c;
  for (let i = 0; i < 1200; i++) {
    atual = somarMeses(atual, 1);
    if (!mesFechado(estado, livro, atual)) return atual;
  }
  throw new RangeError('Nenhum mês aberto encontrado');
}


/** "Mover para o mês em aberto": leva a despesa para o primeiro mês aberto depois do dela. */
export function moverParaMesAberto(estado: Estado, id: string, ctx: Contexto): Resultado {
  const atual = despesaPorId(estado, id);
  if (!atual || atual.excluida) return invalido('Despesa não encontrada.');
  const destino = proximoMesAberto(estado, atual.livro, atual.competencia);
  return sucesso([novoEvento(ctx, 'alterar', 'despesa', id, { competencia: destino })]);
}
