// Auxiliar SÓ PARA TESTES: simula um celular com relógio, ids e banco local próprios.
// Dados sempre fictícios.

import { criarCategoriasIniciais } from '../categorias.ts';
import { definirNomes } from '../config.ts';
import type { Contexto, Resultado } from '../contexto.ts';
import type { Evento } from '../eventos.ts';
import { lerEstado, type Estado } from '../estado.ts';
import { avancar, formatarHlc, lerHlc, receber, type Hlc } from '../hlc.ts';
import { projetar } from '../projecao.ts';
import type { DataISO, Pessoa } from '../tipos.ts';

export class AparelhoDeTeste {
  eventos: Evento[] = [];
  private hlc: Hlc | null = null;
  private sequencia = 0;
  agoraMs: number;

  constructor(
    readonly nome: string,
    readonly autor: Pessoa,
    public hoje: DataISO,
  ) {
    this.agoraMs = Date.parse(`${hoje}T12:00:00Z`);
  }

  get ctx(): Contexto {
    return {
      autor: this.autor,
      hoje: this.hoje,
      carimbar: () => {
        this.hlc = avancar(this.hlc, this.agoraMs, this.nome);
        return formatarHlc(this.hlc);
      },
      novoId: () => `${this.nome}-${String(++this.sequencia)}`,
    };
  }

  estado(): Estado {
    return lerEstado(projetar(this.eventos));
  }

  /** Aplica o resultado de uma regra; falha o teste se a regra recusar. */
  aplicar(r: Resultado | readonly Evento[]): readonly Evento[] {
    if ('ok' in r) {
      if (!r.ok) throw new Error(`Regra recusou: ${JSON.stringify(r)}`);
      this.eventos.push(...r.eventos);
      return r.eventos;
    }
    this.eventos.push(...r);
    return r;
  }

  /** Executa uma regra com o estado e o contexto deste aparelho. */
  fazer(regra: (estado: Estado, ctx: Contexto) => Resultado | readonly Evento[]): readonly Evento[] {
    return this.aplicar(regra(this.estado(), this.ctx));
  }

  /** Sincroniza: recebe os eventos que o outro aparelho tem e este não. */
  receberDe(outro: AparelhoDeTeste): void {
    const conhecidos = new Set(this.eventos.map((e) => e.id));
    for (const e of outro.eventos) {
      if (conhecidos.has(e.id)) continue;
      this.eventos.push(e);
      this.hlc = receber(this.hlc, lerHlc(e.hlc), this.agoraMs, this.nome);
    }
  }

  avancarMinutos(minutos: number): void {
    this.agoraMs += minutos * 60_000;
  }

  mudarDia(hoje: DataISO): void {
    this.hoje = hoje;
    this.agoraMs = Math.max(this.agoraMs, Date.parse(`${hoje}T12:00:00Z`));
  }
}

/** Sincroniza os dois lados. */
export function sincronizar(a: AparelhoDeTeste, b: AparelhoDeTeste): void {
  a.receberDe(b);
  b.receberDe(a);
}

/** Configuração inicial fictícia: nomes Ana e Bruno, categorias proporcionais em 60%. */
export function iniciarCasa(aparelho: AparelhoDeTeste, pctProporcional = 6000): void {
  aparelho.fazer((e, ctx) => definirNomes(e, 'Ana', 'Bruno', ctx));
  aparelho.fazer((_, ctx) => criarCategoriasIniciais(pctProporcional, ctx));
}

export function idCategoria(estado: Estado, nome: string): string {
  const c = estado.categorias.find((x) => x.nome === nome);
  if (!c) throw new Error(`Categoria ${nome} não existe`);
  return c.id;
}

/** Embaralha de forma determinística (para testar que a ordem de chegada não importa). */
export function embaralhar<T>(lista: readonly T[], semente: number): T[] {
  const copia = [...lista];
  let s = semente;
  for (let i = copia.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    const a = copia[i] as T;
    copia[i] = copia[j] as T;
    copia[j] = a;
  }
  return copia;
}
