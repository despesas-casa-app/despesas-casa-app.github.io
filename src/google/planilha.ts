import { ehMetaCofre, type MetaCofre } from '../aplicacao/cofre.ts';
import type { LeituraRemota, LinhaRemota, RepositorioRemoto } from '../armazenamento/remoto.ts';
import { chamarGoogle, type Buscar, type ObterToken } from './api.ts';

/**
 * A planilha do casal no Google Sheets (especificação 3 e 6), usada só como log de acréscimo:
 * - aba "meta": parâmetros de criptografia (salt, iterações, DEK embrulhada pela frase);
 * - aba "eventos": uma linha por evento — id, versão do esquema e conteúdo cifrado.
 * O app nunca apaga nem sobrescreve linhas: até a troca de frase acrescenta uma linha nova em
 * "meta" (vale a última).
 */
export const ABA_META = 'meta';
export const ABA_EVENTOS = 'eventos';
export const FORMATO = 'viver-gasta-v1';
export const TITULO_PADRAO = 'Viver Gasta (dados criptografados)';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

interface RespostaValores {
  values?: unknown[][];
}

function intervalo(id: string, faixa: string): string {
  return `${BASE}/${encodeURIComponent(id)}/values/${encodeURIComponent(faixa)}`;
}

export class PlanilhaGoogle implements RepositorioRemoto {
  constructor(
    readonly id: string,
    private readonly obterToken: ObterToken,
    private readonly buscar: Buscar = (u, i) => fetch(u, i),
  ) {}

  /** Cria a planilha com as duas abas e os cabeçalhos. */
  static async criar(obterToken: ObterToken, buscar: Buscar = (u, i) => fetch(u, i), titulo = TITULO_PADRAO): Promise<PlanilhaGoogle> {
    const criada = await chamarGoogle<{ spreadsheetId?: string }>(buscar, obterToken, BASE, {
      metodo: 'POST',
      corpo: {
        properties: { title: titulo, locale: 'pt_BR' },
        sheets: [{ properties: { title: ABA_META } }, { properties: { title: ABA_EVENTOS } }],
      },
    });
    if (!criada.spreadsheetId) throw new Error('O Google não devolveu o id da planilha.');
    const planilha = new PlanilhaGoogle(criada.spreadsheetId, obterToken, buscar);
    await planilha.acrescentar(ABA_META, [['chave', 'valor'], ['formato', FORMATO]]);
    await planilha.acrescentar(ABA_EVENTOS, [['id', 'versao', 'conteudo']]);
    return planilha;
  }

  /** Endereço para abrir a planilha no navegador. */
  get endereco(): string {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(this.id)}`;
  }

  private async acrescentar(aba: string, valores: (string | number)[][]): Promise<void> {
    const url = `${intervalo(this.id, `${aba}!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    await chamarGoogle(this.buscar, this.obterToken, url, { metodo: 'POST', corpo: { values: valores } });
  }

  async anexar(linhas: readonly LinhaRemota[]): Promise<void> {
    if (linhas.length === 0) return;
    await this.acrescentar(ABA_EVENTOS, linhas.map((l) => [l.id, l.versao, l.conteudo]));
  }

  /** Lê a aba "eventos" a partir de uma posição (0 = primeira linha depois do cabeçalho). */
  async lerAPartirDe(posicao: number): Promise<LeituraRemota> {
    const inicio = Math.max(0, Math.trunc(posicao));
    const url = `${intervalo(this.id, `${ABA_EVENTOS}!A${String(inicio + 2)}:C`)}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`;
    const r = await chamarGoogle<RespostaValores>(this.buscar, this.obterToken, url);
    const valores = r.values ?? [];
    const linhas: LinhaRemota[] = [];
    for (const [id, versao, conteudo] of valores) {
      const v = typeof versao === 'number' ? versao : Number(versao);
      if (typeof id === 'string' && id !== '' && Number.isInteger(v) && typeof conteudo === 'string' && conteudo !== '') {
        linhas.push({ id, versao: v, conteudo });
      }
    }
    // A posição conta TODAS as linhas lidas, inclusive as inválidas, para não relê-las.
    return { linhas, proximaPosicao: inicio + valores.length };
  }

  /** Lê os parâmetros do cofre (vale a última linha "cofre" válida). */
  async lerMetaCofre(): Promise<MetaCofre | null> {
    const r = await chamarGoogle<RespostaValores>(this.buscar, this.obterToken, `${intervalo(this.id, `${ABA_META}!A2:B`)}?valueRenderOption=UNFORMATTED_VALUE`);
    let encontrada: MetaCofre | null = null;
    let formatoOk = false;
    for (const [chave, valor] of r.values ?? []) {
      if (chave === 'formato' && valor === FORMATO) formatoOk = true;
      if (chave !== 'cofre' || typeof valor !== 'string') continue;
      try {
        const m: unknown = JSON.parse(valor);
        if (ehMetaCofre(m)) encontrada = m;
      } catch {
        // linha inválida: ignora
      }
    }
    return formatoOk ? encontrada : null;
  }

  /** Acrescenta os parâmetros do cofre (criação ou troca de frase). */
  async anexarMetaCofre(meta: MetaCofre): Promise<void> {
    await this.acrescentar(ABA_META, [['cofre', JSON.stringify(meta)]]);
  }
}
