import { invalido, novoEvento, sucesso, type Contexto, type Resultado } from './contexto.ts';
import { ID_CONFIG, type Config, type Estado } from './estado.ts';
import type { Pessoa } from './tipos.ts';

export const TAMANHO_MAXIMO_NOME = 30;

/** Define os nomes da Pessoa A e da Pessoa B. */
export function definirNomes(estado: Estado, nomeA: string, nomeB: string, ctx: Contexto): Resultado {
  const a = nomeA.trim();
  const b = nomeB.trim();
  if (a === '' || b === '') return invalido('Informe os dois nomes.');
  if (a.length > TAMANHO_MAXIMO_NOME || b.length > TAMANHO_MAXIMO_NOME) return invalido('Nome longo demais.');
  if (a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR')) return invalido('Os nomes precisam ser diferentes.');
  const existe = estado.projecao.registros.has(`config:${ID_CONFIG}`);
  if (existe && estado.config.nomeA === a && estado.config.nomeB === b) return sucesso([]);
  return sucesso([
    novoEvento(ctx, existe ? 'alterar' : 'criar', 'config', ID_CONFIG, { nomeA: a, nomeB: b, moeda: 'BRL' }),
  ]);
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function ehEmailValido(email: string): boolean {
  return RE_EMAIL.test(normalizarEmail(email));
}

/**
 * Define os e-mails Google autorizados (especificação 5.5). Ficam só dentro do conteúdo
 * criptografado. Depois do login, o app confere se o e-mail está nesta lista.
 */
export function definirEmails(estado: Estado, emailA: string, emailB: string, ctx: Contexto): Resultado {
  const a = normalizarEmail(emailA);
  const b = normalizarEmail(emailB);
  if (!ehEmailValido(a) || !ehEmailValido(b)) return invalido('Informe dois e-mails válidos.');
  if (a === b) return invalido('Os e-mails precisam ser diferentes.');
  const existe = estado.projecao.registros.has(`config:${ID_CONFIG}`);
  if (!existe) return invalido('Defina os nomes antes dos e-mails.');
  if (estado.config.emailA === a && estado.config.emailB === b) return sucesso([]);
  return sucesso([novoEvento(ctx, 'alterar', 'config', ID_CONFIG, { emailA: a, emailB: b })]);
}

/** De quem é este e-mail? null = não autorizado. */
export function pessoaDoEmail(config: Config, email: string): Pessoa | null {
  const e = normalizarEmail(email);
  if (e === '') return null;
  if (e === config.emailA) return 'A';
  if (e === config.emailB) return 'B';
  return null;
}
