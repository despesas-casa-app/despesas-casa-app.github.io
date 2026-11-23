import {
  chaveEntidade,
  compararEventos,
  type Entidade,
  type Evento,
  type ValorCampo,
} from './eventos.ts';
import type { Pessoa } from './tipos.ts';

/** Estado atual de uma entidade, montado a partir dos eventos. */
export interface Registro {
  readonly entidade: Entidade;
  readonly id: string;
  readonly campos: Readonly<Record<string, ValorCampo>>;
  readonly criadoEm: string;
  readonly criadoPor: Pessoa;
  readonly alteradoEm: string;
  readonly alteradoPor: Pessoa;
  /** Se houve alguma alteração depois da criação. */
  readonly editado: boolean;
}

export interface Projecao {
  readonly registros: ReadonlyMap<string, Registro>;
  /** Todos os eventos, sem repetição, em ordem de HLC. */
  readonly eventos: readonly Evento[];
}

interface RegistroMutavel {
  entidade: Entidade;
  id: string;
  campos: Record<string, ValorCampo>;
  criadoEm: string;
  criadoPor: Pessoa;
  alteradoEm: string;
  alteradoPor: Pessoa;
  editado: boolean;
}

/** Junta eventos sem repetir (pelo id do evento) e põe em ordem de HLC. */
export function ordenarSemRepetir(eventos: readonly Evento[]): Evento[] {
  const porId = new Map<string, Evento>();
  for (const e of eventos) if (!porId.has(e.id)) porId.set(e.id, e);
  return [...porId.values()].sort(compararEventos);
}

/**
 * Monta o estado aplicando os eventos em ordem de HLC. Como a ordem é sempre a mesma, todos os
 * aparelhos chegam ao mesmo resultado, não importa em que ordem receberam os eventos.
 */
export function projetar(eventos: readonly Evento[]): Projecao {
  const ordenados = ordenarSemRepetir(eventos);
  const registros = new Map<string, RegistroMutavel>();

  for (const e of ordenados) {
    const chave = chaveEntidade(e.entidade, e.entidadeId);
    const atual = registros.get(chave);
    if (e.tipo === 'criar') {
      if (atual) continue; // idempotente: vale a primeira criação
      registros.set(chave, {
        entidade: e.entidade,
        id: e.entidadeId,
        campos: { ...e.campos },
        criadoEm: e.hlc,
        criadoPor: e.autor,
        alteradoEm: e.hlc,
        alteradoPor: e.autor,
        editado: false,
      });
    } else {
      if (!atual) continue; // alteração de algo que não existe: ignorada
      Object.assign(atual.campos, e.campos); // ordem por HLC ⇒ última escrita vence, campo a campo
      atual.alteradoEm = e.hlc;
      atual.alteradoPor = e.autor;
      atual.editado = true;
    }
  }

  return { registros, eventos: ordenados };
}

export function registrosDe(projecao: Projecao, entidade: Entidade): Registro[] {
  const lista: Registro[] = [];
  for (const r of projecao.registros.values()) if (r.entidade === entidade) lista.push(r);
  return lista;
}

/** Eventos que afetam uma entidade (para a linha do tempo). */
export function historicoDe(projecao: Projecao, entidade: Entidade, id: string): Evento[] {
  return projecao.eventos.filter((e) => e.entidade === entidade && e.entidadeId === id);
}
