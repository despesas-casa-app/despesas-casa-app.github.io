import { describe, expect, it } from 'vitest';
import { compararEventos, ehEvento, type Evento } from './eventos.ts';
import {
  categoriaPorId,
  despesasDoMes,
  lerEstado,
  NOMES_PADRAO,
  nomeDe,
  rotuloDespesa,
} from './estado.ts';
import { historicoDe, ordenarSemRepetir, projetar, registrosDe } from './projecao.ts';
import { embaralhar } from './testes/aparelho.ts';

let seq = 0;
function ev(p: Partial<Evento> & Pick<Evento, 'hlc'>): Evento {
  seq += 1;
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    versao: 1,
    autor: 'A',
    tipo: 'criar',
    entidade: 'despesa',
    entidadeId: 'd1',
    campos: {},
    ...p,
  };
}
const h = (ms: number, c = 0, ap = 'x') => `${String(ms).padStart(15, '0')}:${String(c).padStart(5, '0')}:${ap}`;

describe('eventos', () => {
  it('valida o formato vindo de fora', () => {
    const bom = ev({ hlc: h(1), campos: { valor: 10, nome: 'a', ok: true, nada: null } });
    expect(ehEvento(bom)).toBe(true);
    expect(ehEvento(null)).toBe(false);
    expect(ehEvento('x')).toBe(false);
    expect(ehEvento({ ...bom, id: '' })).toBe(false);
    expect(ehEvento({ ...bom, versao: '1' })).toBe(false);
    expect(ehEvento({ ...bom, hlc: 'x' })).toBe(false);
    expect(ehEvento({ ...bom, autor: 'C' })).toBe(false);
    expect(ehEvento({ ...bom, tipo: 'apagar' })).toBe(false);
    expect(ehEvento({ ...bom, entidade: 'usuario' })).toBe(false);
    expect(ehEvento({ ...bom, entidadeId: 5 })).toBe(false);
    expect(ehEvento({ ...bom, campos: [] })).toBe(false);
    expect(ehEvento({ ...bom, campos: null })).toBe(false);
    expect(ehEvento({ ...bom, campos: { x: { y: 1 } } })).toBe(false);
    expect(ehEvento({ ...bom, campos: { x: Number.NaN } })).toBe(false);
  });

  it('ordena por HLC e desempata pelo id', () => {
    const a = ev({ hlc: h(1), id: 'b' });
    const b = ev({ hlc: h(1), id: 'a' });
    const c = ev({ hlc: h(0), id: 'z' });
    expect([a, b, c].sort(compararEventos).map((e) => e.id)).toEqual(['z', 'a', 'b']);
    expect(compararEventos(a, a)).toBe(0);
  });
});

describe('projeção', () => {
  it('criação repetida é ignorada (vale a de menor HLC)', () => {
    const p = projetar([
      ev({ hlc: h(5), autor: 'B', campos: { valor: 2 } }),
      ev({ hlc: h(3), autor: 'A', campos: { valor: 1 } }),
    ]);
    const r = p.registros.get('despesa:d1');
    expect(r?.campos['valor']).toBe(1);
    expect(r?.criadoPor).toBe('A');
    expect(r?.editado).toBe(false);
  });

  it('alteração: última escrita vence campo a campo', () => {
    const p = projetar([
      ev({ hlc: h(1), campos: { valor: 1, descricao: 'x' } }),
      ev({ hlc: h(9), tipo: 'alterar', autor: 'B', campos: { valor: 3 } }),
      ev({ hlc: h(5), tipo: 'alterar', campos: { valor: 2, descricao: 'y' } }),
    ]);
    const r = p.registros.get('despesa:d1');
    expect(r?.campos).toEqual({ valor: 3, descricao: 'y' });
    expect(r?.alteradoPor).toBe('B');
    expect(r?.editado).toBe(true);
  });

  it('alteração de entidade inexistente é ignorada', () => {
    const p = projetar([ev({ hlc: h(1), tipo: 'alterar', campos: { valor: 1 } })]);
    expect(p.registros.size).toBe(0);
  });

  it('eventos repetidos (mesmo id) contam uma vez', () => {
    const e = ev({ hlc: h(1) });
    expect(ordenarSemRepetir([e, e, e])).toHaveLength(1);
  });

  it('o resultado não depende da ordem de chegada', () => {
    const eventos: Evento[] = [];
    for (let i = 0; i < 40; i++) {
      eventos.push(ev({ hlc: h(i, 0, i % 2 ? 'a' : 'b'), tipo: i % 5 === 0 ? 'criar' : 'alterar', entidadeId: `d${String(i % 3)}`, campos: { valor: i } }));
    }
    const base = projetar(eventos);
    for (const s of [1, 7, 13, 2026]) {
      expect(projetar(embaralhar(eventos, s)).registros).toEqual(base.registros);
    }
  });

  it('lista registros e histórico por entidade', () => {
    const p = projetar([
      ev({ hlc: h(1) }),
      ev({ hlc: h(2), entidade: 'categoria', entidadeId: 'c1' }),
      ev({ hlc: h(3), tipo: 'alterar', campos: { valor: 5 } }),
    ]);
    expect(registrosDe(p, 'categoria').map((r) => r.id)).toEqual(['c1']);
    expect(historicoDe(p, 'despesa', 'd1')).toHaveLength(2);
  });
});

describe('estado tipado', () => {
  it('usa padrões seguros para dados incompletos ou estranhos', () => {
    const e = lerEstado(
      projetar([
        ev({ hlc: h(1), entidade: 'categoria', entidadeId: 'c', campos: { nome: 5, pctA: 'x' } }),
        ev({ hlc: h(2), campos: { valor: 1.5, pagador: 'Z', status: 'qualquer', origemTipo: 'parcela' } }),
        ev({ hlc: h(3), entidade: 'recorrente', entidadeId: 'r', campos: { tipoValor: 'variavel', fim: '' } }),
        ev({ hlc: h(4), entidade: 'parcelamento', entidadeId: 'p', campos: { status: 'cancelado' } }),
        ev({ hlc: h(5), entidade: 'fechamento', entidadeId: 'f', campos: { transferenciaDe: 'Q', despesasContadas: '' } }),
        ev({ hlc: h(6), entidade: 'config', entidadeId: 'config', campos: { nomeA: '' } }),
      ]),
    );
    expect(e.config).toEqual({ ...NOMES_PADRAO, emailA: '', emailB: '', moeda: 'BRL' });
    expect(e.categorias[0]).toMatchObject({ nome: 'Sem nome', pctA: 5000, ativa: true });
    expect(e.despesas[0]).toMatchObject({ valor: 0, pagador: 'A', status: 'normal', origem: { tipo: 'manual' }, livro: 'casa' });
    expect(e.recorrentes[0]).toMatchObject({ tipoValor: 'variavel', fim: null, pctA: null, dia: 1 });
    expect(e.parcelamentos[0]?.status).toBe('cancelado');
    expect(e.fechamentos[0]).toMatchObject({ transferenciaDe: null, despesasContadas: [], status: 'aberto' });
  });

  it('lê origens de recorrente e parcela', () => {
    const e = lerEstado(
      projetar([
        ev({ hlc: h(1), entidadeId: 'a', campos: { origemTipo: 'recorrente', origemId: 'r1', descricao: 'Luz' } }),
        ev({ hlc: h(2), entidadeId: 'b', campos: { origemTipo: 'parcela', origemId: 'p1', parcelaK: 3, parcelaN: 10, descricao: 'Sofá' } }),
      ]),
    );
    const [a, b] = e.despesas;
    expect(a?.origem).toEqual({ tipo: 'recorrente', id: 'r1' });
    expect(b?.origem).toEqual({ tipo: 'parcela', id: 'p1', k: 3, n: 10 });
    expect(rotuloDespesa(b ?? a!)).toBe('Sofá 3/10');
    expect(rotuloDespesa(a!)).toBe('Luz');
  });

  it('ordena categorias e despesas do mês', () => {
    const e = lerEstado(
      projetar([
        ev({ hlc: h(1), entidade: 'categoria', entidadeId: 'c2', campos: { nome: 'B', ordem: 1 } }),
        ev({ hlc: h(2), entidade: 'categoria', entidadeId: 'c1', campos: { nome: 'A', ordem: 1 } }),
        ev({ hlc: h(3), entidadeId: 'd1', campos: { data: '2026-11-02', competencia: '2026-11' } }),
        ev({ hlc: h(4), entidadeId: 'd2', campos: { data: '2026-11-05', competencia: '2026-11' } }),
        ev({ hlc: h(5), entidadeId: 'd3', campos: { data: '2026-11-05', competencia: '2026-11' } }),
        ev({ hlc: h(6), entidadeId: 'd4', campos: { data: '2026-11-05', competencia: '2026-11', excluida: true } }),
        ev({ hlc: h(7), entidadeId: 'd5', campos: { data: '2026-10-05', competencia: '2026-10' } }),
        ev({ hlc: h(8), entidadeId: 'd6', campos: { data: '2026-11-01', competencia: '2026-11' } }),
      ]),
    );
    expect(e.categorias.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(despesasDoMes(e, 'casa', '2026-11').map((d) => d.id)).toEqual(['d3', 'd2', 'd1', 'd6']);
    expect(categoriaPorId(e, 'c9')).toBeUndefined();
    expect(nomeDe(e.config, 'B')).toBe('Pessoa B');
  });
});
