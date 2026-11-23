// Fluxos com o Google usando um "Google" de mentira em memória. Dados fictícios.
import { describe, expect, it, vi } from 'vitest';
import { ArmazemEmMemoria } from '../armazenamento/cifrado.ts';
import { LocalEmMemoria } from '../armazenamento/local.ts';
import { ErroSemAutorizacao, RemotoEmMemoria } from '../armazenamento/remoto.ts';
import { gerarDek } from '../cripto/chaves.ts';
import { gerarFrase } from '../cripto/frase.ts';
import { criarDespesa } from '../dominio/despesas.ts';
import { Cofre, type MetaCofre } from './cofre.ts';
import type { PlanilhaDoCasal, ServicoRemoto } from './servicoRemoto.ts';
import { ContaNaoAutorizada, Sessao } from './sessao.ts';

class PlanilhaFalsa extends RemotoEmMemoria implements PlanilhaDoCasal {
  metas: MetaCofre[] = [];
  constructor(readonly id: string, private readonly servico: ServicoFalso) {
    super();
  }
  get endereco(): string {
    return `https://planilha.test/${this.id}`;
  }
  override anexar(linhas: Parameters<RemotoEmMemoria['anexar']>[0]): Promise<void> {
    if (!this.servico.conectado) return Promise.reject(new ErroSemAutorizacao());
    return super.anexar(linhas);
  }
  lerMetaCofre(): Promise<MetaCofre | null> {
    return Promise.resolve(this.metas.at(-1) ?? null);
  }
  anexarMetaCofre(meta: MetaCofre): Promise<void> {
    this.metas.push(meta);
    return Promise.resolve();
  }
}

/** Um "Google" compartilhado pelos dois celulares; cada celular tem a sua conta logada. */
class GoogleFalso {
  planilhas = new Map<string, PlanilhaFalsa>();
  compartilhamentos: [string, string][] = [];
}

class ServicoFalso implements ServicoRemoto {
  conectado = false;
  constructor(private readonly google: GoogleFalso, public email: string) {}
  preparar = vi.fn(() => Promise.resolve());
  entrar(): Promise<void> {
    this.conectado = true;
    return Promise.resolve();
  }
  emailDaConta(): Promise<string> {
    return Promise.resolve(this.email);
  }
  criarPlanilha(): Promise<PlanilhaDoCasal> {
    const p = new PlanilhaFalsa(`p${String(this.google.planilhas.size + 1)}`, this);
    this.google.planilhas.set(p.id, p);
    return Promise.resolve(p);
  }
  abrirPlanilha(id: string): PlanilhaDoCasal {
    const p = this.google.planilhas.get(id);
    if (!p) throw new Error('não existe');
    return p;
  }
  compartilhar(id: string, email: string): Promise<void> {
    this.google.compartilhamentos.push([id, email]);
    return Promise.resolve();
  }
  escolherPlanilha(): Promise<{ id: string; nome: string } | null> {
    return Promise.resolve(null);
  }
  sair(): void {
    this.conectado = false;
  }
}

function celular(google: GoogleFalso, email: string) {
  const armazem = new ArmazemEmMemoria();
  const cofre = new Cofre(armazem, { iteracoes: 1000 });
  const remoto = new ServicoFalso(google, email);
  const sessao = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), remoto });
  return { armazem, cofre, remoto, sessao };
}

/** Pessoa A cria o cofre com a planilha (como na tela "Criar o cofre"). */
async function primeiraPessoa(google: GoogleFalso) {
  const ana = celular(google, 'pessoa.a@exemplo.com');
  await ana.sessao.iniciar();
  await ana.remoto.entrar();
  const palavras = gerarFrase();
  const dek = await gerarDek();
  const planilha = await ana.remoto.criarPlanilha();
  const meta = await ana.cofre.gerarMeta(dek, palavras);
  await planilha.anexarMetaCofre(meta);
  await ana.cofre.salvarMeta(meta);
  await ana.cofre.configurarPin(dek, '284917');
  await ana.sessao.concluirCriacao(
    dek,
    { nomeA: 'Ana', nomeB: 'Bruno', euSou: 'A', pctProporcional: 6000, emailA: 'pessoa.a@exemplo.com', emailB: 'pessoa.b@exemplo.com' },
    planilha.id,
  );
  const e = ana.sessao.obter();
  if (e.fase !== 'aberto' || !e.sync) throw new Error('deveria estar aberto com sincronização');
  await e.sync.ocioso();
  await e.sync.sincronizar();
  await ana.remoto.compartilhar(planilha.id, 'pessoa.b@exemplo.com');
  return { ...ana, palavras, planilha: google.planilhas.get(planilha.id)!, loja: e.loja, sync: e.sync };
}

describe('1ª pessoa: cofre com planilha', () => {
  it('cria, envia tudo cifrado para a planilha e compartilha com a 2ª pessoa', async () => {
    const google = new GoogleFalso();
    const ana = await primeiraPessoa(google);
    expect(ana.sync.obter().tipo).toBe('sincronizado');
    expect(ana.planilha.tamanho).toBe(15); // config + e-mails + 13 categorias
    expect(ana.planilha.metas).toHaveLength(1);
    expect(google.compartilhamentos).toEqual([[ana.planilha.id, 'pessoa.b@exemplo.com']]);
    expect(ana.sessao.enderecoPlanilha).toBe(`https://planilha.test/${ana.planilha.id}`);
    expect(ana.remoto.preparar).toHaveBeenCalled();
    expect(ana.loja.obterFoto().estado.config).toMatchObject({ emailA: 'pessoa.a@exemplo.com', emailB: 'pessoa.b@exemplo.com' });
  });
});

describe('2ª pessoa: entrar no cofre existente', () => {
  it('lê o cofre da planilha, confere a frase, baixa tudo e descobre quem é', async () => {
    const google = new GoogleFalso();
    const ana = await primeiraPessoa(google);
    ana.loja.executar((e, ctx) =>
      criarDespesa(e, {
        valor: 4590, descricao: 'Mercado', data: '2026-11-10', competencia: '2026-11',
        categoriaId: e.categorias[1]?.id ?? '', pagador: 'A', pctA: 6000, pctPadrao: true,
      }, ctx),
    );
    await ana.sync.sincronizar();

    const bruno = celular(google, 'Pessoa.B@exemplo.com');
    await bruno.sessao.iniciar();
    await bruno.remoto.entrar();
    const meta = await bruno.sessao.lerCofreDaPlanilha(ana.planilha.id);
    expect(await bruno.sessao.conferirFrase(meta, gerarFrase().join(' '))).toEqual({ ok: false, motivo: 'nao-confere' });
    expect(await bruno.cofre.existe()).toBe(false); // conferir não grava nada
    const r = await bruno.sessao.conferirFrase(meta, ana.palavras.join(' '));
    if (!r.ok) throw new Error('frase certa deveria abrir');
    await bruno.cofre.configurarPin(r.dek, '739154');
    await bruno.sessao.entrarEmCofreExistente(r.dek, meta, ana.planilha.id);

    const e = bruno.sessao.obter();
    if (e.fase !== 'aberto') throw new Error('deveria estar aberto');
    expect(e.loja.obterFoto().euSou).toBe('B');
    expect(e.loja.obterFoto().estado.despesas.map((d) => d.descricao)).toContain('Mercado');
    expect(await bruno.cofre.existe()).toBe(true);
    expect(bruno.armazem.meta.get('planilhaId')).toBe(ana.planilha.id);

    // Reabrindo o app (com a sessão de 1 hora), já volta sincronizando.
    const reaberta = new Sessao({ armazem: bruno.armazem, cofre: bruno.cofre, repositorioDemo: new LocalEmMemoria(), remoto: bruno.remoto });
    await reaberta.iniciar();
    const e2 = reaberta.obter();
    expect(e2.fase === 'aberto' && e2.sync !== null).toBe(true);
  });

  it('conta Google não autorizada: recusa e apaga o que baixou', async () => {
    const google = new GoogleFalso();
    const ana = await primeiraPessoa(google);
    const intruso = celular(google, 'intruso@exemplo.com');
    await intruso.remoto.entrar();
    const meta = await intruso.sessao.lerCofreDaPlanilha(ana.planilha.id);
    const r = await intruso.sessao.conferirFrase(meta, ana.palavras.join(' '));
    if (!r.ok) throw new Error('frase certa');
    await expect(intruso.sessao.entrarEmCofreExistente(r.dek, meta, ana.planilha.id)).rejects.toBeInstanceOf(ContaNaoAutorizada);
    expect(intruso.armazem.linhas.size).toBe(0);
    expect(await intruso.cofre.existe()).toBe(false);
  });

  it('planilha que não é um cofre, e app sem Google, dão erro claro', async () => {
    const google = new GoogleFalso();
    const c = celular(google, 'pessoa.b@exemplo.com');
    const vazia = await c.remoto.criarPlanilha();
    await expect(c.sessao.lerCofreDaPlanilha(vazia.id)).rejects.toThrow('não é um cofre');
    const semGoogle = new Sessao({ armazem: new ArmazemEmMemoria(), cofre: new Cofre(new ArmazemEmMemoria()), repositorioDemo: new LocalEmMemoria() });
    await expect(semGoogle.lerCofreDaPlanilha('x')).rejects.toThrow('não está configurado');
    expect(semGoogle.remoto).toBeNull();
  });
});

describe('"Toque para sincronizar" e troca de frase', () => {
  it('sem login, pede toque; o toque entra, confere o e-mail e sincroniza', async () => {
    const google = new GoogleFalso();
    const ana = await primeiraPessoa(google);
    ana.remoto.sair();
    ana.loja.executar((e, ctx) =>
      criarDespesa(e, {
        valor: 100, descricao: 'Pão', data: '2026-11-10', competencia: '2026-11',
        categoriaId: e.categorias[1]?.id ?? '', pagador: 'A', pctA: 6000, pctPadrao: true,
      }, ctx),
    );
    await ana.sync.sincronizar();
    expect(ana.sync.obter().tipo).toBe('precisa-toque');
    await ana.sessao.entrarNoGoogle();
    expect(ana.sync.obter().tipo).toBe('sincronizado');
    // Com outra conta logada: recusa e desconecta.
    ana.remoto.email = 'intruso@exemplo.com';
    await expect(ana.sessao.entrarNoGoogle()).rejects.toBeInstanceOf(ContaNaoAutorizada);
    expect(ana.remoto.conectado).toBe(false);
    expect(ana.sessao.nomeDeQuemUsa()).toBe('Ana');
  });

  it('trocar a frase grava os novos parâmetros na planilha: a 2ª pessoa entra com a frase nova', async () => {
    const google = new GoogleFalso();
    const ana = await primeiraPessoa(google);
    const nova = gerarFrase();
    expect((await ana.sessao.trocarFrase(gerarFrase().join(' '), nova)).ok).toBe(false);
    expect((await ana.sessao.trocarFrase(ana.palavras.join(' '), nova)).ok).toBe(true);
    expect(ana.planilha.metas).toHaveLength(2);
    const bruno = celular(google, 'pessoa.b@exemplo.com');
    await bruno.remoto.entrar();
    const meta = await bruno.sessao.lerCofreDaPlanilha(ana.planilha.id);
    expect((await bruno.sessao.conferirFrase(meta, ana.palavras.join(' '))).ok).toBe(false);
    expect((await bruno.sessao.conferirFrase(meta, nova.join(' '))).ok).toBe(true);
  });

  it('bloquear desliga a sincronização; apagar o celular também desconecta o Google', async () => {
    const google = new GoogleFalso();
    const ana = await primeiraPessoa(google);
    await ana.sessao.bloquear();
    expect(ana.sessao.obter().fase).toBe('bloqueado');
    expect(ana.sessao.enderecoPlanilha).toBeNull();
    expect(ana.sessao.nomeDeQuemUsa()).toBe('Viver Gasta');
    await ana.sessao.entrarNoGoogle(); // bloqueado: não faz nada
    await ana.sessao.apagarDadosDoAparelho();
    expect(ana.remoto.conectado).toBe(false);
  });
});
