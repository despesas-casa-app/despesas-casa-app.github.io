import { ehMetaCofre, type MetaCofre } from '../aplicacao/cofre.ts';
import { deBase64 } from '../cripto/base64.ts';
import { derivarChaveDeSegredo, desembrulharDek, ErroDeCriptografia } from '../cripto/chaves.ts';
import { decifrarEvento } from '../cripto/conteudo.ts';
import { fraseCanonica, validarFrase } from '../cripto/frase.ts';
import type { Evento } from '../dominio/eventos.ts';
import { lerEstado, type Estado } from '../dominio/estado.ts';
import { lerCsv } from '../dominio/csv.ts';
import { csvAcertos, csvDespesas } from '../dominio/exportacao.ts';

export { lerCsv };
import { projetar } from '../dominio/projecao.ts';

/**
 * Recuperação (especificação 10): a partir dos CSVs das abas "meta" e "eventos" baixados do Drive
 * e da frase-mestra, remonta tudo e gera os CSVs legíveis. Roda inteiro no navegador, sem rede.
 */

export type TipoArquivo = 'meta' | 'eventos' | 'desconhecido';

/** Reconhece qual aba é pelo cabeçalho. */
export function tipoDoArquivo(linhas: readonly string[][]): TipoArquivo {
  const cab = (linhas[0] ?? []).map((x) => x.trim().toLowerCase());
  if (cab[0] === 'chave' && cab[1] === 'valor') return 'meta';
  if (cab[0] === 'id' && cab[1] === 'versao' && cab[2] === 'conteudo') return 'eventos';
  return 'desconhecido';
}

/** A última linha "cofre" válida da aba meta. */
export function metaDoCsv(linhas: readonly string[][]): MetaCofre | null {
  let meta: MetaCofre | null = null;
  for (const [chave, valor] of linhas.slice(1)) {
    if (chave !== 'cofre' || !valor) continue;
    try {
      const m: unknown = JSON.parse(valor);
      if (ehMetaCofre(m)) meta = m;
    } catch {
      // linha inválida: ignora
    }
  }
  return meta;
}

export interface ResultadoRecuperacao {
  readonly estado: Estado;
  readonly eventos: number;
  /** Linhas que não abriram com a chave (corrompidas ou de outro cofre). */
  readonly ilegiveis: number;
  readonly despesasCsv: string;
  readonly acertosCsv: string;
}

export class ErroDeRecuperacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeRecuperacao';
  }
}

/** Remonta os dados. Lança ErroDeRecuperacao com uma mensagem clara quando algo não confere. */
export async function recuperar(metaCsv: string, eventosCsv: string, frase: string): Promise<ResultadoRecuperacao> {
  const metaLinhas = lerCsv(metaCsv);
  const eventosLinhas = lerCsv(eventosCsv);
  if (tipoDoArquivo(metaLinhas) !== 'meta') throw new ErroDeRecuperacao('O arquivo da aba "meta" não foi reconhecido.');
  if (tipoDoArquivo(eventosLinhas) !== 'eventos') throw new ErroDeRecuperacao('O arquivo da aba "eventos" não foi reconhecido.');
  const meta = metaDoCsv(metaLinhas);
  if (!meta) throw new ErroDeRecuperacao('A aba "meta" não tem os parâmetros do cofre.');

  const v = validarFrase(frase);
  if (!v.ok) {
    throw new ErroDeRecuperacao(
      v.erro === 'quantidade'
        ? `A frase tem 7 palavras (foram digitadas ${String(v.encontradas)}).`
        : `A palavra ${String(v.posicao)} ("${v.digitada}") não está na lista.`,
    );
  }
  let dek: CryptoKey;
  try {
    const kek = await derivarChaveDeSegredo(fraseCanonica(v.palavras), deBase64(meta.salt), meta.iteracoes);
    dek = await desembrulharDek(meta.dek, kek, 'frase');
  } catch (e) {
    if (e instanceof ErroDeCriptografia) throw new ErroDeRecuperacao('Essa não é a frase deste cofre.');
    throw e;
  }

  const eventos: Evento[] = [];
  let ilegiveis = 0;
  for (const [id = '', versao = '', conteudo = ''] of eventosLinhas.slice(1)) {
    try {
      eventos.push(await decifrarEvento(dek, { id, versao: Number(versao), conteudo }));
    } catch {
      ilegiveis += 1;
    }
  }
  const estado = lerEstado(projetar(eventos));
  return { estado, eventos: eventos.length, ilegiveis, despesasCsv: csvDespesas(estado), acertosCsv: csvAcertos(estado) };
}
