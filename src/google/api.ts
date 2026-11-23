import { ErroDeRede, ErroSemAcesso, ErroSemAutorizacao, ErroTemporario } from '../armazenamento/remoto.ts';

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

/** Fornece o token atual; lança ErroSemAutorizacao se não houver login válido. */
export type ObterToken = () => string;

interface CorpoErroGoogle {
  error?: { code?: number; message?: string; status?: string; errors?: { reason?: string }[] };
}

/**
 * Chama uma API do Google com o token e traduz os erros para os da sincronização.
 * O token só vive em memória e só vai no cabeçalho, nunca na URL.
 */
export async function chamarGoogle<T>(
  buscar: Buscar,
  obterToken: ObterToken,
  url: string,
  opcoes: { metodo?: 'GET' | 'POST'; corpo?: unknown } = {},
): Promise<T> {
  const token = obterToken();
  let resposta: Response;
  try {
    resposta = await buscar(url, {
      method: opcoes.metodo ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opcoes.corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ErroDeRede();
  }
  if (resposta.ok) return (await resposta.json()) as T;

  let corpo: CorpoErroGoogle = {};
  try {
    corpo = (await resposta.json()) as CorpoErroGoogle;
  } catch {
    // sem corpo JSON
  }
  const motivo = corpo.error?.errors?.[0]?.reason ?? '';
  const mensagem = corpo.error?.message ?? `Erro ${String(resposta.status)} do Google.`;
  if (resposta.status === 401) throw new ErroSemAutorizacao();
  if (resposta.status === 429 || resposta.status >= 500 || /rateLimit|quota/i.test(motivo)) {
    throw new ErroTemporario();
  }
  if (resposta.status === 403) throw new ErroSemAcesso();
  if (resposta.status === 404) throw new ErroSemAcesso('A planilha não foi encontrada (foi apagada ou não está compartilhada).');
  throw new Error(mensagem);
}
