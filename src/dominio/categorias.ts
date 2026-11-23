import { competenciaDaData } from './competencia.ts';
import { invalido, novoEvento, sucesso, type Contexto, type Resultado } from './contexto.ts';
import type { Evento, ValorCampo } from './eventos.ts';
import { categoriaPorId, mesFechado, type Categoria, type Despesa, type Estado } from './estado.ts';
import { ehPercentualValido, METADE } from './percentual.ts';
import type { PontosBase } from './tipos.ts';

export interface CategoriaInicial {
  readonly nome: string;
  readonly icone: string;
  readonly cor: string;
  /** "Proporcional": recebe o % definido no onboarding. As outras começam em 50/50. */
  readonly proporcional: boolean;
}

/** Categorias iniciais (especificação 4.5). */
export const CATEGORIAS_INICIAIS: readonly CategoriaInicial[] = [
  { nome: 'Moradia', icone: '🏠', cor: '#d97706', proporcional: true },
  { nome: 'Despesas da Casa', icone: '🧺', cor: '#ca8a04', proporcional: true },
  { nome: 'Contas de Consumo', icone: '💡', cor: '#eab308', proporcional: true },
  { nome: 'Viagens', icone: '✈️', cor: '#0284c7', proporcional: false },
  { nome: 'Carro', icone: '🚗', cor: '#475569', proporcional: false },
  { nome: 'Gatinhos', icone: '🐱', cor: '#f97316', proporcional: false },
  { nome: 'Casamento', icone: '💍', cor: '#db2777', proporcional: false },
  { nome: 'Seguro', icone: '🛡️', cor: '#0f766e', proporcional: false },
  { nome: 'Transporte', icone: '🚌', cor: '#4f46e5', proporcional: false },
  { nome: 'Entretenimento', icone: '🎬', cor: '#9333ea', proporcional: false },
  { nome: 'Hospedagem', icone: '🛏️', cor: '#0891b2', proporcional: false },
  { nome: 'Compras', icone: '🛍️', cor: '#16a34a', proporcional: false },
  { nome: 'Outros', icone: '📦', cor: '#78716c', proporcional: false },
];

/** Eventos que criam as categorias iniciais, com o % proporcional definido no onboarding. */
export function criarCategoriasIniciais(pctProporcional: PontosBase, ctx: Contexto): Evento[] {
  if (!ehPercentualValido(pctProporcional)) throw new RangeError('Percentual inválido');
  return CATEGORIAS_INICIAIS.map((c, i) =>
    novoEvento(ctx, 'criar', 'categoria', ctx.novoId(), {
      nome: c.nome,
      icone: c.icone,
      cor: c.cor,
      pctA: c.proporcional ? pctProporcional : METADE,
      ativa: true,
      ordem: i,
    }),
  );
}

export interface DadosCategoria {
  readonly nome: string;
  readonly icone: string;
  readonly cor: string;
  readonly pctA: PontosBase;
}

function validarCategoria(estado: Estado, d: DadosCategoria, idAtual?: string): string | null {
  const nome = d.nome.trim();
  if (nome === '') return 'Informe o nome.';
  if (nome.length > 40) return 'Nome longo demais.';
  if (!ehPercentualValido(d.pctA)) return 'Percentual inválido.';
  const repetida = estado.categorias.some(
    (c) => c.id !== idAtual && c.nome.trim().toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'),
  );
  return repetida ? 'Já existe uma categoria com esse nome.' : null;
}

export function criarCategoria(estado: Estado, d: DadosCategoria, ctx: Contexto): Resultado {
  const erro = validarCategoria(estado, d);
  if (erro) return invalido(erro);
  const ordem = estado.categorias.reduce((max, c) => Math.max(max, c.ordem), -1) + 1;
  return sucesso([
    novoEvento(ctx, 'criar', 'categoria', ctx.novoId(), {
      nome: d.nome.trim(),
      icone: d.icone || '•',
      cor: d.cor,
      pctA: d.pctA,
      ativa: true,
      ordem,
    }),
  ]);
}

/**
 * Despesas que seguiriam o novo % da categoria: as de meses NÃO fechados que ainda usam o %
 * padrão. Meses fechados nunca mudam (especificação 4.4).
 */
export function despesasQueUsamOPadrao(estado: Estado, categoriaId: string): Despesa[] {
  return estado.despesas.filter(
    (d) =>
      !d.excluida &&
      d.categoriaId === categoriaId &&
      d.pctPadrao &&
      !mesFechado(estado, d.livro, d.competencia),
  );
}

/**
 * Altera a categoria. Se o % mudar e "aplicarAsDespesasAbertas" for true, as despesas dos meses
 * abertos que usam o % padrão também mudam. As de meses fechados, nunca.
 */
export function alterarCategoria(
  estado: Estado,
  id: string,
  d: DadosCategoria,
  aplicarAsDespesasAbertas: boolean,
  ctx: Contexto,
): Resultado {
  const atual = categoriaPorId(estado, id);
  if (!atual) return invalido('Categoria não encontrada.');
  const erro = validarCategoria(estado, d, id);
  if (erro) return invalido(erro);

  const campos: Record<string, ValorCampo> = {};
  if (d.nome.trim() !== atual.nome) campos['nome'] = d.nome.trim();
  if (d.icone !== atual.icone) campos['icone'] = d.icone;
  if (d.cor !== atual.cor) campos['cor'] = d.cor;
  if (d.pctA !== atual.pctA) campos['pctA'] = d.pctA;
  if (Object.keys(campos).length === 0) return sucesso([]);

  const eventos = [novoEvento(ctx, 'alterar', 'categoria', id, campos)];
  if (d.pctA !== atual.pctA && aplicarAsDespesasAbertas) {
    for (const despesa of despesasQueUsamOPadrao(estado, id)) {
      if (despesa.pctA !== d.pctA) {
        eventos.push(novoEvento(ctx, 'alterar', 'despesa', despesa.id, { pctA: d.pctA }));
      }
    }
  }
  return sucesso(eventos);
}

export function arquivarCategoria(estado: Estado, id: string, arquivar: boolean, ctx: Contexto): Resultado {
  const atual = categoriaPorId(estado, id);
  if (!atual) return invalido('Categoria não encontrada.');
  if (atual.ativa === !arquivar) return sucesso([]);
  return sucesso([novoEvento(ctx, 'alterar', 'categoria', id, { ativa: !arquivar })]);
}

/** Move a categoria uma posição para cima (-1) ou para baixo (+1), renumerando a ordem. */
export function moverCategoria(estado: Estado, id: string, direcao: -1 | 1, ctx: Contexto): Resultado {
  const lista: Categoria[] = [...estado.categorias];
  const i = lista.findIndex((c) => c.id === id);
  const j = i + direcao;
  const a = lista[i];
  const b = lista[j];
  if (i < 0 || !a || !b) return sucesso([]);
  lista[i] = b;
  lista[j] = a;
  const eventos: Evento[] = [];
  lista.forEach((c, ordem) => {
    if (c.ordem !== ordem) eventos.push(novoEvento(ctx, 'alterar', 'categoria', c.id, { ordem }));
  });
  return sucesso(eventos);
}

/** Mês corrente do aparelho. */
export function mesCorrente(ctx: Contexto): string {
  return competenciaDaData(ctx.hoje);
}
