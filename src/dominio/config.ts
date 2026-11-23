import { invalido, novoEvento, sucesso, type Contexto, type Resultado } from './contexto.ts';
import { ID_CONFIG, type Estado } from './estado.ts';

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
