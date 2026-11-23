import { chamarGoogle, type Buscar, type ObterToken } from './api.ts';

const DRIVE = 'https://www.googleapis.com/drive/v3';

/** E-mail da conta Google que fez o login (funciona com o escopo drive.file). */
export async function emailDaConta(obterToken: ObterToken, buscar: Buscar = (u, i) => fetch(u, i)): Promise<string> {
  const r = await chamarGoogle<{ user?: { emailAddress?: string } }>(buscar, obterToken, `${DRIVE}/about?fields=user(emailAddress)`);
  const email = r.user?.emailAddress;
  if (!email) throw new Error('O Google não informou o e-mail da conta.');
  return email.toLowerCase();
}

/**
 * Compartilha a planilha com a outra pessoa (como editora). O Google manda um e-mail avisando.
 * Com o escopo drive.file isso só é possível em arquivos que o próprio app criou.
 */
export async function compartilharPlanilha(
  planilhaId: string,
  email: string,
  obterToken: ObterToken,
  buscar: Buscar = (u, i) => fetch(u, i),
): Promise<void> {
  const mensagem = 'Planilha do app Viver Gasta. Os dados são criptografados: abra pelo app, não por aqui.';
  const url = `${DRIVE}/files/${encodeURIComponent(planilhaId)}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(mensagem)}`;
  await chamarGoogle(buscar, obterToken, url, { metodo: 'POST', corpo: { role: 'writer', type: 'user', emailAddress: email } });
}
