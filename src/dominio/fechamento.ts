import { invalido, novoEvento, sucesso, type Contexto, type Resultado } from './contexto.ts';
import { proximoMesAberto } from './despesas.ts';
import {
  despesasDoMes,
  fechamentoDe,
  idFechamento,
  type Despesa,
  type Estado,
  type Fechamento,
} from './estado.ts';
import { resumirMes, type ResumoMes } from './saldo.ts';
import type { Competencia } from './tipos.ts';

export function resumoDoMes(estado: Estado, livro: string, c: Competencia): ResumoMes {
  return resumirMes(c, despesasDoMes(estado, livro, c));
}

/**
 * "Acertar contas": registra a transferência e trava o mês (especificação 4.4).
 * A tela deve alertar antes se houver despesas "aguardando valor" (resumo.aguardando).
 */
export function fecharMes(estado: Estado, livro: string, c: Competencia, ctx: Contexto): Resultado {
  const atual = fechamentoDe(estado, livro, c);
  if (atual?.status === 'fechado') return invalido('Este mês já está fechado.');
  const r = resumoDoMes(estado, livro, c);
  const campos = {
    livro,
    competencia: c,
    status: 'fechado',
    totalGasto: r.totalGasto,
    saldoA: r.saldoA,
    transferenciaDe: r.transferencia?.de ?? null,
    valorTransferencia: r.transferencia?.valor ?? 0,
    despesasContadas: r.contadas.map((d) => d.id).sort().join(','),
    data: ctx.hoje,
    fechadoPor: ctx.autor,
  };
  const id = idFechamento(livro, c);
  return sucesso([novoEvento(ctx, atual ? 'alterar' : 'criar', 'fechamento', id, campos)]);
}

/** Reabre o mês (com confirmação na tela). Fica no histórico. */
export function reabrirMes(estado: Estado, livro: string, c: Competencia, ctx: Contexto): Resultado {
  const atual = fechamentoDe(estado, livro, c);
  if (atual?.status !== 'fechado') return invalido('Este mês não está fechado.');
  return sucesso([novoEvento(ctx, 'alterar', 'fechamento', atual.id, { status: 'aberto' })]);
}

export interface Divergencia {
  readonly fechamento: Fechamento;
  /** Despesas do mês fechado que não entraram na conta (chegaram depois pela sincronização). */
  readonly chegaramDepois: readonly Despesa[];
  /** Se alguma despesa que entrou na conta mudou depois do fechamento. */
  readonly contaMudou: boolean;
}

/**
 * Procura meses fechados que "mudaram" depois do acerto — o caso de alguém lançar offline numa
 * competência que o outro fechou nesse meio-tempo. A tela mostra a janela
 * "Esse mês já está fechado. O que você deseja fazer?".
 */
export function divergenciasDeFechamento(estado: Estado, livro: string): Divergencia[] {
  const lista: Divergencia[] = [];
  for (const f of estado.fechamentos) {
    if (f.livro !== livro || f.status !== 'fechado') continue;
    const contadas = new Set(f.despesasContadas);
    const doMes = despesasDoMes(estado, livro, f.competencia);
    const chegaramDepois = doMes.filter((d) => d.status === 'normal' && !contadas.has(d.id));
    const aindaContadas = doMes.filter((d) => d.status === 'normal' && contadas.has(d.id));
    const r = resumirMes(f.competencia, aindaContadas);
    const contaMudou =
      aindaContadas.length !== contadas.size || r.totalGasto !== f.totalGasto || r.saldoA !== f.saldoA;
    if (chegaramDepois.length > 0 || contaMudou) lista.push({ fechamento: f, chegaramDepois, contaMudou });
  }
  return lista.sort((a, b) => (a.fechamento.competencia < b.fechamento.competencia ? -1 : 1));
}

export { proximoMesAberto };
