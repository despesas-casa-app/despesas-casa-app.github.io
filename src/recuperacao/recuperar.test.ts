// Recuperação a partir dos CSVs da planilha. Dados fictícios.
import { describe, expect, it } from 'vitest';
import { Cofre } from '../aplicacao/cofre.ts';
import { ArmazemEmMemoria } from '../armazenamento/cifrado.ts';
import { gerarDek } from '../cripto/chaves.ts';
import { cifrarEvento } from '../cripto/conteudo.ts';
import { gerarFrase } from '../cripto/frase.ts';
import { criarDespesa } from '../dominio/despesas.ts';
import { fecharMes } from '../dominio/fechamento.ts';
import { LIVRO_CASA } from '../dominio/tipos.ts';
import { AparelhoDeTeste, idCategoria, iniciarCasa } from '../dominio/testes/aparelho.ts';
import { lerCsv, metaDoCsv, recuperar, tipoDoArquivo } from './recuperar.ts';

/** Gera uma célula CSV como o Google Planilhas exporta. */
function celula(v: string | number): string {
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

async function planilhaFicticia() {
  const ana = new AparelhoDeTeste('celAna', 'A', '2026-11-20');
  iniciarCasa(ana);
  ana.fazer((e, ctx) =>
    criarDespesa(e, {
      valor: 4590, descricao: 'Mercado, "o grande"', data: '2026-10-08', competencia: '2026-10',
      categoriaId: idCategoria(e, 'Despesas da Casa'), pagador: 'A', pctA: 6000, pctPadrao: true,
    }, ctx),
  );
  ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-10', ctx));
  const palavras = gerarFrase();
  const dek = await gerarDek();
  const cofre = new Cofre(new ArmazemEmMemoria(), { iteracoes: 1000 });
  const metaVelha = await cofre.gerarMeta(dek, gerarFrase());
  const meta = await cofre.gerarMeta(dek, palavras);
  const linhas = await Promise.all(ana.eventos.map((e) => cifrarEvento(dek, e)));
  const metaCsv = ['chave,valor', 'formato,viver-gasta-v1', `cofre,${celula(JSON.stringify(metaVelha))}`, `cofre,${celula(JSON.stringify(meta))}`].join('\r\n');
  const eventosCsv = ['﻿id,versao,conteudo', ...linhas.map((l) => [l.id, l.versao, l.conteudo].map(celula).join(','))].join('\n') + '\n';
  return { palavras, metaCsv, eventosCsv, total: ana.eventos.length };
}

describe('leitura dos CSVs do Google Planilhas', () => {
  it('lê aspas, vírgulas e quebras de linha dentro de células', () => {
    expect(lerCsv('a,b\r\n"x, y","diz ""oi"""\n"linha\nquebrada",3\n\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'diz "oi"'],
      ['linha\nquebrada', '3'],
    ]);
    expect(lerCsv('a,b')).toEqual([['a', 'b']]);
  });

  it('reconhece as abas pelo cabeçalho', () => {
    expect(tipoDoArquivo([['chave', 'valor']])).toBe('meta');
    expect(tipoDoArquivo([['id', 'versao', 'conteudo']])).toBe('eventos');
    expect(tipoDoArquivo([['Data', 'Valor']])).toBe('desconhecido');
    expect(tipoDoArquivo([])).toBe('desconhecido');
  });

  it('usa a última linha "cofre" válida e ignora as estragadas', () => {
    expect(metaDoCsv([['chave', 'valor'], ['cofre', '{ruim'], ['cofre', '{"a":1}'], ['cofre', '']])).toBeNull();
  });
});

describe('recuperação', () => {
  it('com a frase certa, remonta tudo e gera os CSVs legíveis', async () => {
    const { palavras, metaCsv, eventosCsv, total } = await planilhaFicticia();
    const r = await recuperar(metaCsv, eventosCsv, palavras.map((p) => p.slice(0, 4)).join(' '));
    expect(r.eventos).toBe(total);
    expect(r.ilegiveis).toBe(0);
    expect(r.estado.config.nomeA).toBe('Ana');
    expect(r.despesasCsv).toContain('08/10/2026;outubro de 2026;"Mercado, ""o grande""";Despesas da Casa;45,90;Ana;60,00;40,00');
    expect(r.acertosCsv).toContain('outubro de 2026;acertado;45,90;Bruno;Ana;18,36');
  });

  it('linhas adulteradas ou de outro cofre ficam de fora (e são contadas)', async () => {
    const { palavras, metaCsv, eventosCsv, total } = await planilhaFicticia();
    const linhas = eventosCsv.trim().split('\n');
    linhas[2] = linhas[2]!.replace(/,([^,]+)$/, ',AAAA');
    const r = await recuperar(metaCsv, linhas.join('\n'), palavras.join(' '));
    expect(r.ilegiveis).toBe(1);
    expect(r.eventos).toBe(total - 1);
  });

  it('mensagens claras para frase errada, frase inválida e arquivos trocados', async () => {
    const { palavras, metaCsv, eventosCsv } = await planilhaFicticia();
    await expect(recuperar(metaCsv, eventosCsv, gerarFrase().join(' '))).rejects.toThrow('Essa não é a frase deste cofre.');
    await expect(recuperar(metaCsv, eventosCsv, 'duas palavras')).rejects.toThrow('7 palavras');
    await expect(recuperar(metaCsv, eventosCsv, `${palavras.slice(0, 6).join(' ')} zzzzzz`)).rejects.toThrow('palavra 7');
    await expect(recuperar(eventosCsv, metaCsv, palavras.join(' '))).rejects.toThrow('aba "meta"');
    await expect(recuperar(metaCsv, metaCsv, palavras.join(' '))).rejects.toThrow('aba "eventos"');
    await expect(recuperar('chave,valor\nformato,viver-gasta-v1', eventosCsv, palavras.join(' '))).rejects.toThrow('parâmetros do cofre');
  });
});
