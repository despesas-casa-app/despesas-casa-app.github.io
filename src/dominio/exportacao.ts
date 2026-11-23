import { formatarData, nomeDaCompetencia } from './competencia.ts';
import type { Centavos } from './dinheiro.ts';
import { dividir } from './divisao.ts';
import { categoriaPorId, nomeDe, rotuloDespesa, type Despesa, type Estado } from './estado.ts';
import { complemento } from './percentual.ts';
import type { PontosBase } from './tipos.ts';

/**
 * Backup legível (especificação 7, Configurações): CSV gerado no próprio aparelho, no formato que o
 * Excel e o Google Planilhas em português abrem direto — separador ";", vírgula decimal, datas
 * dd/mm/aaaa e UTF-8 com BOM (para os acentos aparecerem certos).
 * O mesmo gerador é usado pela página de recuperação.
 */
export const SEPARADOR = ';';
export const BOM = '﻿';

/**
 * Escapa uma célula: aspas em volta quando há separador, aspas ou quebra de linha.
 * Proteção contra fórmulas (CSV injection): um texto que começa com =, +, -, @, tab ou retorno vira
 * fórmula ao abrir no Excel/Planilhas; ganha um apóstrofo na frente e aparece como texto.
 * Números como "-5,00" (valores negativos) não são tocados.
 */
export function celula(valor: string | number): string {
  let texto = String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto) && !/^-\d+(,\d+)?$/.test(texto)) texto = `'${texto}`;
  return /[;"\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

function linhaCsv(valores: readonly (string | number)[]): string {
  return valores.map(celula).join(SEPARADOR);
}

/** 123456 → "1234,56" (sem "R$" e sem ponto de milhar, para a planilha entender como número). */
export function numeroReais(centavos: Centavos): string {
  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${sinal}${String(Math.floor(abs / 100))},${String(abs % 100).padStart(2, '0')}`;
}

/** 5835 → "58,35". */
export function numeroPercentual(p: PontosBase): string {
  return `${String(Math.floor(p / 100))},${String(p % 100).padStart(2, '0')}`;
}

function origemTexto(d: Despesa): string {
  switch (d.origem.tipo) {
    case 'manual':
      return 'avulsa';
    case 'importada':
      return d.origem.acertada ? 'importada (já acertada no Tricount)' : 'importada';
    case 'recorrente':
      return 'recorrente';
    case 'parcela':
      return `parcela ${String(d.origem.k)}/${String(d.origem.n)}`;
  }
}

/** Todas as despesas vivas, da mais antiga para a mais nova. */
export function csvDespesas(estado: Estado): string {
  const { config } = estado;
  const linhas = [
    linhaCsv([
      'Data', 'Mês da conta', 'Descrição', 'Categoria', 'Valor (R$)', 'Quem pagou',
      `% de ${config.nomeA}`, `% de ${config.nomeB}`, `Parte de ${config.nomeA} (R$)`, `Parte de ${config.nomeB} (R$)`,
      'Tipo', 'Situação', 'Lançada por', 'Última alteração por', 'Id',
    ]),
  ];
  const despesas = estado.despesas
    .filter((d) => !d.excluida)
    .sort((a, b) => (a.data === b.data ? (a.criadoEm < b.criadoEm ? -1 : 1) : a.data < b.data ? -1 : 1));
  for (const d of despesas) {
    const aguardando = d.status === 'aguardando';
    const cotas = aguardando ? null : dividir(d.valor, d.pctA, d.pagador);
    linhas.push(
      linhaCsv([
        formatarData(d.data),
        nomeDaCompetencia(d.competencia),
        rotuloDespesa(d),
        categoriaPorId(estado, d.categoriaId)?.nome ?? '',
        aguardando ? '' : numeroReais(d.valor),
        nomeDe(config, d.pagador),
        numeroPercentual(d.pctA),
        numeroPercentual(complemento(d.pctA)),
        cotas ? numeroReais(cotas.A) : '',
        cotas ? numeroReais(cotas.B) : '',
        origemTexto(d),
        aguardando ? 'aguardando valor' : 'normal',
        nomeDe(config, d.criadoPor),
        d.editada ? nomeDe(config, d.alteradoPor) : '',
        d.id,
      ]),
    );
  }
  return BOM + linhas.join('\r\n') + '\r\n';
}

/** Meses acertados: total, quem transferiu para quem e quanto. */
export function csvAcertos(estado: Estado): string {
  const { config } = estado;
  const linhas = [linhaCsv(['Mês', 'Situação', 'Total do mês (R$)', 'Quem transferiu', 'Para quem', 'Valor (R$)', 'Data do acerto', 'Acertado por'])];
  const fechamentos = [...estado.fechamentos].sort((a, b) => (a.competencia < b.competencia ? -1 : 1));
  for (const f of fechamentos) {
    const de = f.transferenciaDe;
    linhas.push(
      linhaCsv([
        nomeDaCompetencia(f.competencia),
        f.status === 'fechado' ? (f.importado ? 'acertado no Tricount' : 'acertado') : 'reaberto',
        numeroReais(f.totalGasto),
        de ? nomeDe(config, de) : 'ninguém devia',
        de ? nomeDe(config, de === 'A' ? 'B' : 'A') : '',
        numeroReais(f.valorTransferencia),
        f.data ? formatarData(f.data) : '',
        nomeDe(config, f.fechadoPor),
      ]),
    );
  }
  return BOM + linhas.join('\r\n') + '\r\n';
}

/** Nome sugerido para o arquivo: "viver-gasta-despesas-2026-11-23.csv". */
export function nomeDoArquivo(tipo: 'despesas' | 'acertos', hoje: string): string {
  return `viver-gasta-${tipo}-${hoje}.csv`;
}
