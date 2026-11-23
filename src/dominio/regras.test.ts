import { describe, expect, it } from 'vitest';
import {
  arquivarCategoria,
  CATEGORIAS_INICIAIS,
  alterarCategoria,
  criarCategoria,
  criarCategoriasIniciais,
  despesasQueUsamOPadrao,
  mesCorrente,
  moverCategoria,
} from './categorias.ts';
import { definirNomes } from './config.ts';
import {
  alterarDespesa,
  criarDespesa,
  excluirDespesa,
  ficouForaDoFechamento,
  moverParaMesAberto,
  proximoMesAberto,
  validarDespesa,
  type DadosDespesa,
} from './despesas.ts';
import { despesaPorId, type Estado } from './estado.ts';
import { fecharMes } from './fechamento.ts';
import {
  alterarParcelasRestantes,
  cancelarParcelasRestantes,
  criarParcelamento,
  parcelasDe,
  valoresDasParcelas,
} from './parcelamentos.ts';
import {
  alterarRecorrente,
  criarRecorrente,
  encerrarRecorrente,
  excluirRecorrente,
  gerarRecorrentesPendentes,
  idOcorrencia,
  pausarRecorrente,
  type DadosRecorrente,
} from './recorrentes.ts';
import { LIVRO_CASA } from './tipos.ts';
import { AparelhoDeTeste, idCategoria, iniciarCasa } from './testes/aparelho.ts';

function novaCasa(hoje = '2026-11-10') {
  const ana = new AparelhoDeTeste('celAna', 'A', hoje);
  iniciarCasa(ana);
  return ana;
}

function dados(estado: Estado, extra: Partial<DadosDespesa> = {}): DadosDespesa {
  return {
    valor: 5000,
    descricao: 'Mercado',
    data: '2026-11-08',
    competencia: '2026-11',
    categoriaId: idCategoria(estado, 'Despesas da Casa'),
    pagador: 'A',
    pctA: 6000,
    pctPadrao: true,
    ...extra,
  };
}

describe('despesas', () => {
  it('valida os campos', () => {
    const e = novaCasa().estado();
    expect(validarDespesa(e, dados(e))).toBeNull();
    expect(validarDespesa(e, dados(e, { valor: -1 }))).toBe('Valor inválido.');
    expect(validarDespesa(e, dados(e, { valor: 0 }))).toBe('Informe o valor.');
    expect(validarDespesa(e, dados(e, { valor: 0, status: 'aguardando' }))).toBeNull();
    expect(validarDespesa(e, dados(e, { descricao: '  ' }))).toBe('Informe a descrição.');
    expect(validarDespesa(e, dados(e, { descricao: 'x'.repeat(121) }))).toBe('Descrição longa demais.');
    expect(validarDespesa(e, dados(e, { data: '2026-02-30' }))).toBe('Data inválida.');
    expect(validarDespesa(e, dados(e, { competencia: '2026-13' }))).toBe('Mês de competência inválido.');
    expect(validarDespesa(e, dados(e, { categoriaId: 'nada' }))).toBe('Escolha uma categoria.');
    expect(validarDespesa(e, dados(e, { pagador: 'C' as 'A' }))).toBe('Informe quem pagou.');
    expect(validarDespesa(e, dados(e, { pctA: 10001 }))).toBe('Percentual inválido.');
    expect(criarDespesa(e, dados(e, { valor: 0 }), novaCasa().ctx)).toMatchObject({ ok: false, erro: 'invalido' });
  });

  it('cria com descrição limpa e origem manual', () => {
    const ana = novaCasa();
    const [ev] = ana.fazer((e, ctx) => criarDespesa(e, dados(e, { descricao: '  Feira  ' }), ctx));
    const d = despesaPorId(ana.estado(), ev?.entidadeId ?? '');
    expect(d).toMatchObject({ descricao: 'Feira', origem: { tipo: 'manual' }, status: 'normal', criadoPor: 'A' });
  });

  it('altera só o que mudou; sem mudança, nenhum evento', () => {
    const ana = novaCasa();
    const id = ana.fazer((e, ctx) => criarDespesa(e, dados(e), ctx))[0]?.entidadeId ?? '';
    const [alt] = ana.fazer((e, ctx) => alterarDespesa(e, id, { valor: 6000, descricao: 'Mercado' }, ctx));
    expect(alt?.campos).toEqual({ valor: 6000 });
    expect(ana.fazer((e, ctx) => alterarDespesa(e, id, { valor: 6000 }, ctx))).toEqual([]);
    expect(alterarDespesa(ana.estado(), 'nao-existe', {}, ana.ctx).ok).toBe(false);
    expect(alterarDespesa(ana.estado(), id, { valor: -5 }, ana.ctx).ok).toBe(false);
  });

  it('informar o valor de uma "aguardando" torna a despesa normal', () => {
    const ana = novaCasa();
    const id = ana.fazer((e, ctx) => criarDespesa(e, dados(e, { valor: 0, status: 'aguardando' }), ctx))[0]?.entidadeId ?? '';
    ana.fazer((e, ctx) => alterarDespesa(e, id, { valor: 18990 }, ctx));
    expect(despesaPorId(ana.estado(), id)).toMatchObject({ valor: 18990, status: 'normal', editada: true });
  });

  it('exclui (e não exclui duas vezes)', () => {
    const ana = novaCasa();
    const id = ana.fazer((e, ctx) => criarDespesa(e, dados(e), ctx))[0]?.entidadeId ?? '';
    ana.fazer((e, ctx) => excluirDespesa(e, id, ctx));
    expect(despesaPorId(ana.estado(), id)?.excluida).toBe(true);
    expect(excluirDespesa(ana.estado(), id, ana.ctx).ok).toBe(false);
    expect(alterarDespesa(ana.estado(), id, { valor: 1 }, ana.ctx).ok).toBe(false);
    expect(moverParaMesAberto(ana.estado(), id, ana.ctx).ok).toBe(false);
  });

  it('não move para um mês fechado nem exclui em mês fechado', () => {
    const ana = novaCasa();
    const id = ana.fazer((e, ctx) => criarDespesa(e, dados(e), ctx))[0]?.entidadeId ?? '';
    const outra = ana.fazer((e, ctx) => criarDespesa(e, dados(e, { data: '2026-12-01', competencia: '2026-12' }), ctx))[0]?.entidadeId ?? '';
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    expect(excluirDespesa(ana.estado(), id, ana.ctx)).toMatchObject({ erro: 'mes-fechado' });
    expect(alterarDespesa(ana.estado(), outra, { competencia: '2026-11' }, ana.ctx)).toMatchObject({ erro: 'mes-fechado', competencia: '2026-11' });
    expect(ficouForaDoFechamento(ana.estado(), id)).toBe(false);
    expect(ficouForaDoFechamento(ana.estado(), outra)).toBe(false);
    expect(ficouForaDoFechamento(ana.estado(), 'nada')).toBe(false);
  });

  it('despesa que ficou fora do fechamento só pode sair do mês fechado', () => {
    const ana = novaCasa();
    const id = ana.fazer((e, ctx) => criarDespesa(e, dados(e, { valor: 0, status: 'aguardando' }), ctx))[0]?.entidadeId ?? '';
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    expect(ficouForaDoFechamento(ana.estado(), id)).toBe(true);
    expect(alterarDespesa(ana.estado(), id, { valor: 100 }, ana.ctx)).toMatchObject({ erro: 'mes-fechado' });
    ana.fazer((e, ctx) => alterarDespesa(e, id, { valor: 100, competencia: '2026-12' }, ctx));
    expect(despesaPorId(ana.estado(), id)).toMatchObject({ competencia: '2026-12', status: 'normal' });
  });

  it('próximo mês aberto pula meses fechados seguidos', () => {
    const ana = novaCasa('2027-01-10');
    for (const c of ['2026-11', '2026-12']) ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, c, ctx));
    expect(proximoMesAberto(ana.estado(), LIVRO_CASA, '2026-10')).toBe('2027-01');
  });
});

describe('categorias', () => {
  it('cria as 13 iniciais com o % proporcional só nas 3 primeiras', () => {
    const e = novaCasa().estado();
    expect(e.categorias).toHaveLength(CATEGORIAS_INICIAIS.length);
    expect(e.categorias.filter((c) => c.pctA === 6000).map((c) => c.nome)).toEqual([
      'Moradia', 'Despesas da Casa', 'Contas de Consumo',
    ]);
    expect(() => criarCategoriasIniciais(20000, novaCasa().ctx)).toThrow(RangeError);
  });

  it('cria nova, sem nome repetido', () => {
    const ana = novaCasa();
    ana.fazer((e, ctx) => criarCategoria(e, { nome: 'Pets', icone: '', cor: '#000', pctA: 5000 }, ctx));
    const pets = ana.estado().categorias.at(-1);
    expect(pets).toMatchObject({ nome: 'Pets', icone: '•', ordem: 13 });
    expect(criarCategoria(ana.estado(), { nome: ' pets ', icone: '', cor: '', pctA: 5000 }, ana.ctx).ok).toBe(false);
    expect(criarCategoria(ana.estado(), { nome: '', icone: '', cor: '', pctA: 5000 }, ana.ctx).ok).toBe(false);
    expect(criarCategoria(ana.estado(), { nome: 'x'.repeat(41), icone: '', cor: '', pctA: 5000 }, ana.ctx).ok).toBe(false);
    expect(criarCategoria(ana.estado(), { nome: 'Y', icone: '', cor: '', pctA: -1 }, ana.ctx).ok).toBe(false);
  });

  it('altera nome, ícone e cor; nada muda → nenhum evento', () => {
    const ana = novaCasa();
    const id = idCategoria(ana.estado(), 'Outros');
    const [ev] = ana.fazer((e, ctx) => alterarCategoria(e, id, { nome: 'Diversos', icone: '🎲', cor: '#111', pctA: 5000 }, false, ctx));
    expect(ev?.campos).toEqual({ nome: 'Diversos', icone: '🎲', cor: '#111' });
    expect(ana.fazer((e, ctx) => alterarCategoria(e, id, { nome: 'Diversos', icone: '🎲', cor: '#111', pctA: 5000 }, true, ctx))).toEqual([]);
    expect(alterarCategoria(ana.estado(), 'x', { nome: 'a', icone: '', cor: '', pctA: 1 }, false, ana.ctx).ok).toBe(false);
    expect(alterarCategoria(ana.estado(), id, { nome: '', icone: '', cor: '', pctA: 1 }, false, ana.ctx).ok).toBe(false);
  });

  it('lista as despesas que seguem o padrão e pula as que já têm o novo %', () => {
    const ana = novaCasa();
    const cat = idCategoria(ana.estado(), 'Despesas da Casa');
    ana.fazer((e, ctx) => criarDespesa(e, dados(e, { pctA: 5000 }), ctx));
    ana.fazer((e, ctx) => criarDespesa(e, dados(e), ctx));
    expect(despesasQueUsamOPadrao(ana.estado(), cat)).toHaveLength(2);
    const c = ana.estado().categorias.find((x) => x.id === cat);
    const eventos = ana.fazer((e, ctx) => alterarCategoria(e, cat, { nome: c?.nome ?? '', icone: c?.icone ?? '', cor: c?.cor ?? '', pctA: 5000 }, true, ctx));
    expect(eventos).toHaveLength(2); // categoria + só a despesa que estava em 60%
  });

  it('arquiva, reativa e reordena', () => {
    const ana = novaCasa();
    const id = idCategoria(ana.estado(), 'Carro');
    ana.fazer((e, ctx) => arquivarCategoria(e, id, true, ctx));
    expect(ana.estado().categorias.find((c) => c.id === id)?.ativa).toBe(false);
    expect(ana.fazer((e, ctx) => arquivarCategoria(e, id, true, ctx))).toEqual([]);
    ana.fazer((e, ctx) => arquivarCategoria(e, id, false, ctx));
    expect(arquivarCategoria(ana.estado(), 'x', true, ana.ctx).ok).toBe(false);

    const primeira = ana.estado().categorias[0]?.id ?? '';
    ana.fazer((e, ctx) => moverCategoria(e, primeira, 1, ctx));
    expect(ana.estado().categorias[1]?.id).toBe(primeira);
    expect(ana.fazer((e, ctx) => moverCategoria(e, ana.estado().categorias[0]?.id ?? '', -1, ctx))).toEqual([]);
    expect(ana.fazer((e, ctx) => moverCategoria(e, 'x', 1, ctx))).toEqual([]);
    expect(mesCorrente(ana.ctx)).toBe('2026-11');
  });
});

describe('recorrentes', () => {
  function base(estado: Estado, extra: Partial<DadosRecorrente> = {}): DadosRecorrente {
    return {
      descricao: 'Luz', categoriaId: idCategoria(estado, 'Contas de Consumo'), pagador: 'B',
      tipoValor: 'variavel', valor: 0, dia: 31, inicio: '2026-09', fim: null, pctA: null, ...extra,
    };
  }

  it('variável entra "aguardando valor", com o % da categoria e dia 31 ajustado', () => {
    const ana = novaCasa('2026-11-03');
    ana.fazer((e, ctx) => criarRecorrente(e, base(e), ctx));
    const geradas = ana.estado().despesas.filter((d) => d.origem.tipo === 'recorrente');
    expect(geradas.map((d) => [d.competencia, d.data, d.status, d.valor, d.pctA, d.pctPadrao])).toEqual([
      ['2026-09', '2026-09-30', 'aguardando', 0, 6000, true],
      ['2026-10', '2026-10-31', 'aguardando', 0, 6000, true],
      ['2026-11', '2026-11-30', 'aguardando', 0, 6000, true],
    ]);
  });

  it('valida', () => {
    const e = novaCasa().estado();
    const c = novaCasa().ctx;
    expect(criarRecorrente(e, base(e, { descricao: '' }), c).ok).toBe(false);
    expect(criarRecorrente(e, base(e, { categoriaId: 'x' }), c).ok).toBe(false);
    expect(criarRecorrente(e, base(e, { tipoValor: 'fixo', valor: 0 }), c).ok).toBe(false);
    expect(criarRecorrente(e, base(e, { dia: 32 }), c).ok).toBe(false);
    expect(criarRecorrente(e, base(e, { inicio: 'x' }), c).ok).toBe(false);
    expect(criarRecorrente(e, base(e, { fim: '2026-01' }), c).ok).toBe(false);
    expect(criarRecorrente(e, base(e, { pctA: 20000 }), c).ok).toBe(false);
  });

  it('respeita o fim, não ressuscita ocorrência excluída e pula mês fechado', () => {
    const ana = novaCasa('2026-08-01');
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-09', ctx));
    ana.mudarDia('2026-12-01');
    ana.fazer((e, ctx) => criarRecorrente(e, base(e, { tipoValor: 'fixo', valor: 9000, pctA: 5000, fim: '2026-11', inicio: '2026-08' }), ctx));
    const rec = ana.estado().recorrentes[0]?.id ?? '';
    expect(ana.estado().despesas.map((d) => d.competencia).sort()).toEqual(['2026-08', '2026-10', '2026-11']);
    ana.fazer((e, ctx) => excluirDespesa(e, idOcorrencia(rec, '2026-10'), ctx));
    expect(ana.fazer((e, ctx) => gerarRecorrentesPendentes(e, ctx))).toEqual([]);
    expect(ana.estado().despesas.every((d) => !d.pctPadrao && d.pctA === 5000)).toBe(true);
  });

  it('pausar para de gerar; retomar volta só a partir do mês corrente', () => {
    const ana = novaCasa('2026-09-01');
    ana.fazer((e, ctx) => criarRecorrente(e, base(e, { tipoValor: 'fixo', valor: 100 }), ctx));
    const id = ana.estado().recorrentes[0]?.id ?? '';
    ana.fazer((e, ctx) => pausarRecorrente(e, id, true, ctx));
    ana.mudarDia('2026-11-01');
    expect(ana.fazer((e, ctx) => gerarRecorrentesPendentes(e, ctx))).toEqual([]);
    ana.fazer((e, ctx) => pausarRecorrente(e, id, false, ctx));
    ana.fazer((e, ctx) => gerarRecorrentesPendentes(e, ctx));
    expect(ana.estado().despesas.map((d) => d.competencia).sort()).toEqual(['2026-09', '2026-11']);
  });

  it('retomar uma recorrente que começa no futuro mantém o início', () => {
    const ana = novaCasa('2026-09-01');
    ana.fazer((e, ctx) => criarRecorrente(e, base(e, { inicio: '2027-01' }), ctx));
    const id = ana.estado().recorrentes[0]?.id ?? '';
    const [ev] = ana.fazer((e, ctx) => pausarRecorrente(e, id, false, ctx));
    expect(ev?.campos['inicio']).toBe('2027-01');
  });

  it('altera, encerra e exclui', () => {
    const ana = novaCasa('2026-11-01');
    ana.fazer((e, ctx) => criarRecorrente(e, base(e, { inicio: '2026-11' }), ctx));
    const r = ana.estado().recorrentes[0];
    const id = r?.id ?? '';
    const [alt] = ana.fazer((e, ctx) => alterarRecorrente(e, id, { ...base(e, { inicio: '2026-11' }), descricao: 'Energia' }, ctx));
    expect(alt?.campos).toEqual({ descricao: 'Energia' });
    expect(ana.fazer((e, ctx) => alterarRecorrente(e, id, { ...base(e, { inicio: '2026-11' }), descricao: 'Energia' }, ctx))).toEqual([]);
    expect(alterarRecorrente(ana.estado(), id, base(ana.estado(), { dia: 0 }), ana.ctx).ok).toBe(false);
    ana.fazer((e, ctx) => encerrarRecorrente(e, id, '2026-12', ctx));
    expect(ana.estado().recorrentes[0]?.fim).toBe('2026-12');
    expect(encerrarRecorrente(ana.estado(), id, 'x', ana.ctx).ok).toBe(false);
    ana.fazer((e, ctx) => excluirRecorrente(e, id, ctx));
    for (const regra of [
      () => alterarRecorrente(ana.estado(), id, base(ana.estado()), ana.ctx),
      () => pausarRecorrente(ana.estado(), id, true, ana.ctx),
      () => encerrarRecorrente(ana.estado(), id, '2026-12', ana.ctx),
      () => excluirRecorrente(ana.estado(), id, ana.ctx),
    ]) {
      expect(regra().ok).toBe(false);
    }
  });
});

describe('parcelamentos', () => {
  it('centavos que sobram vão para a 1ª parcela', () => {
    expect(valoresDasParcelas(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(valoresDasParcelas(900, 3)).toEqual([300, 300, 300]);
  });

  it('gera todas as parcelas pelo total, cada uma no seu mês', () => {
    const ana = novaCasa('2026-11-30');
    ana.fazer((e, ctx) =>
      criarParcelamento(e, {
        descricao: ' Geladeira ', categoriaId: idCategoria(e, 'Compras'), pagador: 'B', pctA: 5000, pctPadrao: true,
        n: 3, valorTotal: 10000, dataCompra: '2026-11-30', primeiraCompetencia: '2026-12',
      }, ctx),
    );
    const p = ana.estado().parcelamentos[0];
    expect(p).toMatchObject({ descricao: 'Geladeira', n: 3, valorTotal: 10000, status: 'ativo' });
    const parcelas = parcelasDe(ana.estado(), p?.id ?? '');
    expect(parcelas.map((d) => [d.competencia, d.data, d.valor])).toEqual([
      ['2026-12', '2026-12-30', 3334],
      ['2027-01', '2027-01-30', 3333],
      ['2027-02', '2027-02-28', 3333],
    ]);
  });

  it('valida', () => {
    const e = novaCasa().estado();
    const ctx = novaCasa().ctx;
    const ok = {
      descricao: 'TV', categoriaId: idCategoria(e, 'Compras'), pagador: 'A' as const, pctA: 5000, pctPadrao: true,
      n: 2, valorTotal: 1000, dataCompra: '2026-11-10', primeiraCompetencia: '2026-11',
    };
    expect(criarParcelamento(e, ok, ctx).ok).toBe(true);
    expect(criarParcelamento(e, { ...ok, descricao: ' ' }, ctx).ok).toBe(false);
    expect(criarParcelamento(e, { ...ok, categoriaId: 'x' }, ctx).ok).toBe(false);
    expect(criarParcelamento(e, { ...ok, n: 1 }, ctx).ok).toBe(false);
    expect(criarParcelamento(e, { ...ok, n: 73 }, ctx).ok).toBe(false);
    expect(criarParcelamento(e, { ...ok, pctA: -1 }, ctx).ok).toBe(false);
    expect(criarParcelamento(e, { ...ok, dataCompra: 'x' }, ctx).ok).toBe(false);
    expect(criarParcelamento(e, { ...ok, primeiraCompetencia: 'x' }, ctx).ok).toBe(false);
    const { valorTotal: _sem, ...semValor } = ok;
    expect(criarParcelamento(e, semValor, ctx).ok).toBe(false);
    expect(criarParcelamento(e, { ...ok, valorTotal: 1 }, ctx).ok).toBe(false);
  });

  it('não começa em mês fechado', () => {
    const ana = novaCasa();
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-11', ctx));
    const r = criarParcelamento(ana.estado(), {
      descricao: 'TV', categoriaId: idCategoria(ana.estado(), 'Compras'), pagador: 'A', pctA: 5000, pctPadrao: true,
      n: 2, valorParcela: 500, dataCompra: '2026-11-10', primeiraCompetencia: '2026-11',
    }, ana.ctx);
    expect(r).toMatchObject({ ok: false, erro: 'mes-fechado' });
  });

  function comSofa() {
    const ana = novaCasa('2026-10-10');
    ana.fazer((e, ctx) =>
      criarParcelamento(e, {
        descricao: 'Sofá', categoriaId: idCategoria(e, 'Compras'), pagador: 'A', pctA: 5000, pctPadrao: true,
        n: 5, valorParcela: 45000, dataCompra: '2026-10-10', primeiraCompetencia: '2026-10',
      }, ctx),
    );
    ana.fazer((e, ctx) => fecharMes(e, LIVRO_CASA, '2026-10', ctx));
    return { ana, id: ana.estado().parcelamentos[0]?.id ?? '' };
  }

  it('cancela as restantes (antecipação), sem mexer em mês fechado', () => {
    const { ana, id } = comSofa();
    ana.fazer((e, ctx) => cancelarParcelasRestantes(e, id, '2026-09', ctx));
    expect(parcelasDe(ana.estado(), id).map((d) => d.competencia)).toEqual(['2026-10']);
    expect(ana.estado().parcelamentos[0]?.status).toBe('cancelado');
    expect(cancelarParcelasRestantes(ana.estado(), 'x', '2026-01', ana.ctx).ok).toBe(false);
  });

  it('edita as restantes de uma vez', () => {
    const { ana, id } = comSofa();
    const carro = idCategoria(ana.estado(), 'Carro');
    ana.fazer((e, ctx) =>
      alterarParcelasRestantes(e, id, '2027-01', { valor: 40000, categoriaId: carro, pagador: 'B', pctA: 6000, descricao: 'Sofá novo' }, ctx),
    );
    const parcelas = parcelasDe(ana.estado(), id);
    expect(parcelas.map((d) => d.valor)).toEqual([45000, 45000, 45000, 40000, 40000]);
    expect(parcelas.at(-1)).toMatchObject({ categoriaId: carro, pagador: 'B', pctA: 6000, pctPadrao: false, descricao: 'Sofá novo' });
    expect(ana.estado().parcelamentos[0]?.descricao).toBe('Sofá novo');
    // Sem mudanças efetivas: nada além do registro do parcelamento.
    expect(ana.fazer((e, ctx) => alterarParcelasRestantes(e, id, '2027-01', { valor: 40000 }, ctx))).toEqual([]);
    for (const m of [{ valor: 0 }, { categoriaId: 'x' }, { pctA: -1 }, { descricao: ' ' }]) {
      expect(alterarParcelasRestantes(ana.estado(), id, '2027-01', m, ana.ctx).ok).toBe(false);
    }
    expect(alterarParcelasRestantes(ana.estado(), 'x', '2027-01', {}, ana.ctx).ok).toBe(false);
  });
});

describe('configuração', () => {
  it('define e altera nomes, com validação', () => {
    const ana = new AparelhoDeTeste('celAna', 'A', '2026-11-10');
    const [criar] = ana.fazer((e, ctx) => definirNomes(e, ' Ana ', 'Bruno', ctx));
    expect(criar?.tipo).toBe('criar');
    expect(ana.estado().config).toMatchObject({ nomeA: 'Ana', nomeB: 'Bruno' });
    expect(ana.fazer((e, ctx) => definirNomes(e, 'Ana', 'Bruno', ctx))).toEqual([]);
    const [alterar] = ana.fazer((e, ctx) => definirNomes(e, 'Ana', 'Beto', ctx));
    expect(alterar?.tipo).toBe('alterar');
    expect(definirNomes(ana.estado(), '', 'X', ana.ctx).ok).toBe(false);
    expect(definirNomes(ana.estado(), 'x'.repeat(31), 'X', ana.ctx).ok).toBe(false);
    expect(definirNomes(ana.estado(), 'Ana', 'ana', ana.ctx).ok).toBe(false);
  });
});
