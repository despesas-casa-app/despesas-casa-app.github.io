import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Evento } from '../dominio/eventos.ts';
import { LocalEmMemoria, LocalIndexedDb, type RepositorioLocal } from './local.ts';
import { RemotoEmMemoria } from './remoto.ts';

function evento(id: string): Evento {
  return {
    id,
    versao: 1,
    hlc: `000000000000001:00000:teste`,
    autor: 'A',
    tipo: 'criar',
    entidade: 'despesa',
    entidadeId: `d-${id}`,
    campos: { valor: 100, descricao: 'Fictícia' },
  };
}

describe('remoto em memória', () => {
  it('só acrescenta e lê a partir de uma posição (pull incremental)', async () => {
    const r = new RemotoEmMemoria();
    await r.anexar([{ id: 'a', versao: 1, conteudo: 'x' }, { id: 'b', versao: 1, conteudo: 'y' }]);
    const primeira = await r.lerAPartirDe(0);
    expect(primeira.linhas.map((l) => l.id)).toEqual(['a', 'b']);
    expect(primeira.proximaPosicao).toBe(2);
    await r.anexar([{ id: 'c', versao: 1, conteudo: 'z' }]);
    const segunda = await r.lerAPartirDe(primeira.proximaPosicao);
    expect(segunda.linhas.map((l) => l.id)).toEqual(['c']);
    expect((await r.lerAPartirDe(-5)).linhas).toHaveLength(3);
    expect(r.tamanho).toBe(3);
  });
});

describe.each<[string, () => RepositorioLocal]>([
  ['IndexedDB', () => new LocalIndexedDb(`teste-${String(Math.random())}`)],
  ['memória', () => new LocalEmMemoria()],
])('repositório local (%s)', (_, criar) => {
  it('guarda eventos sem repetir e devolve na leitura', async () => {
    const repo = criar();
    await repo.salvarEventos([evento('1'), evento('2')]);
    await repo.salvarEventos([evento('2'), evento('3')]);
    await repo.salvarEventos([]);
    const ids = (await repo.carregarEventos()).map((e) => e.id).sort();
    expect(ids).toEqual(['1', '2', '3']);
  });

  it('guarda metadados e apaga tudo', async () => {
    const repo = criar();
    await repo.gravarMeta('aparelho', 'cel1');
    expect(await repo.lerMeta('aparelho')).toBe('cel1');
    expect(await repo.lerMeta('nada')).toBeUndefined();
    await repo.salvarEventos([evento('1')]);
    await repo.apagarTudo();
    expect(await repo.carregarEventos()).toEqual([]);
    expect(await repo.lerMeta('aparelho')).toBeUndefined();
  });
});

describe('IndexedDB ignora dados corrompidos', () => {
  it('não quebra com registro em formato estranho', async () => {
    const repo = new LocalIndexedDb(`teste-corrompido-${String(Math.random())}`);
    await repo.salvarEventos([evento('ok'), { ...evento('ruim'), autor: 'Z' } as unknown as Evento]);
    expect((await repo.carregarEventos()).map((e) => e.id)).toEqual(['ok']);
  });
});
