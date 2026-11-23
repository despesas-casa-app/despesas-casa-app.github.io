import { VERSAO_ESQUEMA, type Campos, type Entidade, type Evento } from './eventos.ts';
import type { Competencia, DataISO, Pessoa } from './tipos.ts';

/**
 * Tudo o que uma regra de negócio precisa do "mundo lá fora", passado de fora para dentro.
 * Assim o domínio continua puro e os testes controlam relógio, ids e data.
 */
export interface Contexto {
  /** Quem está fazendo a ação neste aparelho. */
  readonly autor: Pessoa;
  /** Próximo carimbo HLC deste aparelho. */
  carimbar(): string;
  /** Id novo e único (UUID). */
  novoId(): string;
  /** Data de hoje no aparelho. */
  readonly hoje: DataISO;
}

export type Falha =
  | { readonly ok: false; readonly erro: 'mes-fechado'; readonly competencia: Competencia }
  | { readonly ok: false; readonly erro: 'invalido'; readonly mensagem: string };

export type Resultado = { readonly ok: true; readonly eventos: readonly Evento[] } | Falha;

export function sucesso(eventos: readonly Evento[]): Resultado {
  return { ok: true, eventos };
}

export function invalido(mensagem: string): Falha {
  return { ok: false, erro: 'invalido', mensagem };
}

export function mesFechadoFalha(competencia: Competencia): Falha {
  return { ok: false, erro: 'mes-fechado', competencia };
}

export function novoEvento(
  ctx: Contexto,
  tipo: 'criar' | 'alterar',
  entidade: Entidade,
  entidadeId: string,
  campos: Campos,
): Evento {
  return {
    id: ctx.novoId(),
    versao: VERSAO_ESQUEMA,
    hlc: ctx.carimbar(),
    autor: ctx.autor,
    tipo,
    entidade,
    entidadeId,
    campos,
  };
}
