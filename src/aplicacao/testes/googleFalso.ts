// "Google de mentira" em memória, para os testes dos fluxos com planilha. Só dados fictícios.
import { vi } from 'vitest';
import { ArmazemEmMemoria } from '../../armazenamento/cifrado.ts';
import { LocalEmMemoria } from '../../armazenamento/local.ts';
import { ErroDeRede, ErroSemAutorizacao, RemotoEmMemoria, type LeituraRemota } from '../../armazenamento/remoto.ts';
import { gerarDek } from '../../cripto/chaves.ts';
import { gerarFrase } from '../../cripto/frase.ts';
import { Cofre, type MetaCofre } from '../cofre.ts';
import type { Loja } from '../loja.ts';
import type { PlanilhaDoCasal, ServicoRemoto } from '../servicoRemoto.ts';
import { Sessao } from '../sessao.ts';
import type { Sincronizador } from '../sincronizacao.ts';

export class PlanilhaFalsa extends RemotoEmMemoria implements PlanilhaDoCasal {
  metas: MetaCofre[] = [];
  constructor(readonly id: string, private readonly servico: ServicoFalso) {
    super();
  }
  get endereco(): string {
    return `https://planilha.test/${this.id}`;
  }
  override anexar(linhas: Parameters<RemotoEmMemoria['anexar']>[0]): Promise<void> {
    if (this.servico.semInternet) return Promise.reject(new ErroDeRede());
    if (!this.servico.conectado) return Promise.reject(new ErroSemAutorizacao());
    return super.anexar(linhas);
  }
  override lerAPartirDe(posicao: number): Promise<LeituraRemota> {
    if (this.servico.semInternet) return Promise.reject(new ErroDeRede());
    return super.lerAPartirDe(posicao);
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
export class GoogleFalso {
  planilhas = new Map<string, PlanilhaFalsa>();
  compartilhamentos: [string, string][] = [];
}

export class ServicoFalso implements ServicoRemoto {
  conectado = false;
  /** Simula o celular sem internet (as chamadas à planilha falham com ErroDeRede). */
  semInternet = false;
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
    // Cada celular enxerga a mesma planilha, mas com a sua própria conexão.
    const minha = Object.create(p) as PlanilhaFalsa;
    Object.defineProperty(minha, 'servico', { value: this });
    return minha;
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

export function celular(google: GoogleFalso, email: string) {
  const armazem = new ArmazemEmMemoria();
  const cofre = new Cofre(armazem, { iteracoes: 1000 });
  const remoto = new ServicoFalso(google, email);
  const sessao = new Sessao({ armazem, cofre, repositorioDemo: new LocalEmMemoria(), remoto });
  return { armazem, cofre, remoto, sessao };
}

function aberto(sessao: Sessao): { loja: Loja; sync: Sincronizador } {
  const e = sessao.obter();
  if (e.fase !== 'aberto' || !e.sync) throw new Error('deveria estar aberto com sincronização');
  return { loja: e.loja, sync: e.sync };
}

/** Pessoa A cria o cofre com a planilha (como na tela "Criar o cofre"). */
export async function primeiraPessoa(google: GoogleFalso) {
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
  const { loja, sync } = aberto(ana.sessao);
  await sync.ocioso();
  await sync.sincronizar();
  await ana.remoto.compartilhar(planilha.id, 'pessoa.b@exemplo.com');
  const real = google.planilhas.get(planilha.id);
  if (!real) throw new Error('planilha sumiu');
  return { ...ana, palavras, planilha: real, loja, sync };
}

/** Pessoa B entra no cofre existente (como na tela "Já temos um cofre: entrar"). */
export async function segundaPessoa(google: GoogleFalso, planilhaId: string, palavras: readonly string[]) {
  const bruno = celular(google, 'pessoa.b@exemplo.com');
  await bruno.sessao.iniciar();
  await bruno.remoto.entrar();
  const meta = await bruno.sessao.lerCofreDaPlanilha(planilhaId);
  const r = await bruno.sessao.conferirFrase(meta, palavras.join(' '));
  if (!r.ok) throw new Error('a frase certa deveria abrir');
  await bruno.cofre.configurarPin(r.dek, '739154');
  await bruno.sessao.entrarEmCofreExistente(r.dek, meta, planilhaId);
  const aberta = aberto(bruno.sessao);
  await aberta.sync.ocioso();
  return { ...bruno, ...aberta };
}
