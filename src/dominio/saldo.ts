import { formatarReais, type Centavos } from './dinheiro.ts';
import { dividir } from './divisao.ts';
import { nomeDe, type Config, type Despesa } from './estado.ts';
import type { Competencia, Pessoa } from './tipos.ts';

export interface Transferencia {
  readonly de: Pessoa;
  readonly para: Pessoa;
  readonly valor: Centavos;
}

export interface ResumoMes {
  readonly competencia: Competencia;
  /** Despesas que entram na conta (vivas e com valor). */
  readonly contadas: readonly Despesa[];
  /** Despesas recorrentes ainda sem valor. */
  readonly aguardando: readonly Despesa[];
  readonly totalGasto: Centavos;
  readonly pagoPor: Readonly<Record<Pessoa, Centavos>>;
  readonly cotaDe: Readonly<Record<Pessoa, Centavos>>;
  /**
   * Parte do saldo que já foi acertada no Tricount (despesas importadas marcadas como acertadas).
   * Já está descontada do saldoA. Zero fora do mês da importação.
   */
  readonly jaAcertadoA: Centavos;
  /** Total das despesas já acertadas no Tricount (estão dentro do totalGasto). */
  readonly totalJaAcertado: Centavos;
  /** Positivo: A tem a receber. Negativo: A deve. (O saldo de B é o oposto.) */
  readonly saldoA: Centavos;
  readonly transferencia: Transferencia | null;
}

/** Quem deve para quem, a partir do saldo de A. */
export function transferenciaDoSaldo(saldoA: Centavos): Transferencia | null {
  if (saldoA === 0) return null;
  return saldoA > 0 ? { de: 'B', para: 'A', valor: saldoA } : { de: 'A', para: 'B', valor: -saldoA };
}

/**
 * Saldo do mês (especificação 4.4): para cada pessoa, saldo = total que pagou − soma das cotas.
 * Recebe as despesas já filtradas pelo mês (ex.: despesasDoMes).
 */
export function resumirMes(competencia: Competencia, despesas: readonly Despesa[]): ResumoMes {
  const contadas: Despesa[] = [];
  const aguardando: Despesa[] = [];
  const pagoPor = { A: 0, B: 0 };
  const cotaDe = { A: 0, B: 0 };
  let totalGasto = 0;
  let jaAcertadoA = 0;
  let totalJaAcertado = 0;

  for (const d of despesas) {
    if (d.excluida || d.competencia !== competencia) continue;
    if (d.status === 'aguardando') {
      aguardando.push(d);
      continue;
    }
    contadas.push(d);
    const cotas = dividir(d.valor, d.pctA, d.pagador);
    totalGasto += d.valor;
    pagoPor[d.pagador] += d.valor;
    cotaDe.A += cotas.A;
    cotaDe.B += cotas.B;
    if (d.origem.tipo === 'importada' && d.origem.acertada) {
      jaAcertadoA += (d.pagador === 'A' ? d.valor : 0) - cotas.A;
      totalJaAcertado += d.valor;
    }
  }

  const saldoA = pagoPor.A - cotaDe.A - jaAcertadoA;
  return {
    competencia,
    contadas,
    aguardando,
    totalGasto,
    pagoPor,
    cotaDe,
    jaAcertadoA,
    totalJaAcertado,
    saldoA,
    transferencia: transferenciaDoSaldo(saldoA),
  };
}

/** "Bruno deve R$ 342,10 para Ana" ou "Ninguém deve nada". */
export function fraseDoSaldo(t: Transferencia | null, config: Config): string {
  if (!t) return 'Ninguém deve nada';
  return `${nomeDe(config, t.de)} deve ${formatarReais(t.valor)} para ${nomeDe(config, t.para)}`;
}
