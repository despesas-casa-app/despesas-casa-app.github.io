import { useState } from 'react';
import {
  alterarCategoria,
  arquivarCategoria,
  criarCategoria,
  despesasQueUsamOPadrao,
  moverCategoria,
  type DadosCategoria,
} from '../../dominio/categorias.ts';
import type { Categoria } from '../../dominio/estado.ts';
import { formatarPercentual, lerPercentual } from '../../dominio/percentual.ts';
import { AcoesJanela, Cabecalho, Janela } from '../componentes/Basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisar, useFoto, useLoja } from '../contexto.tsx';

const CORES = ['#d97706', '#ca8a04', '#eab308', '#16a34a', '#0f766e', '#0891b2', '#0284c7', '#4f46e5', '#9333ea', '#db2777', '#f97316', '#475569', '#78716c'];

interface Edicao {
  readonly id: string | null;
  nome: string;
  icone: string;
  cor: string;
  pctTexto: string;
}

export function Categorias() {
  const loja = useLoja();
  const { estado } = useFoto();
  const avisar = useAvisar();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [perguntaAplicar, setPerguntaAplicar] = useState<{ id: string; dados: DadosCategoria; quantas: number } | null>(null);
  const { nomeA, nomeB } = estado.config;

  const abrir = (c?: Categoria): void => {
    setErro(null);
    setEdicao(
      c
        ? { id: c.id, nome: c.nome, icone: c.icone, cor: c.cor, pctTexto: formatarPercentual(c.pctA).replace('%', '') }
        : { id: null, nome: '', icone: '🏷️', cor: CORES[0] ?? '#999', pctTexto: '50' },
    );
  };

  const salvar = (): void => {
    if (!edicao) return;
    const pct = lerPercentual(edicao.pctTexto);
    if (pct === null) {
      setErro('Percentual inválido. Use de 0 a 100, com até 2 casas.');
      return;
    }
    const dados: DadosCategoria = { nome: edicao.nome, icone: edicao.icone.trim(), cor: edicao.cor, pctA: pct };
    if (edicao.id === null) {
      const r = loja.executar((e, ctx) => criarCategoria(e, dados, ctx));
      if (r.ok) {
        setEdicao(null);
        avisar('Categoria criada');
      } else if (r.erro === 'invalido') setErro(r.mensagem);
      return;
    }
    const atual = estado.categorias.find((c) => c.id === edicao.id);
    const quantas = despesasQueUsamOPadrao(estado, edicao.id).filter((d) => d.pctA !== pct).length;
    if (atual && atual.pctA !== pct && quantas > 0) {
      setPerguntaAplicar({ id: edicao.id, dados, quantas });
      return;
    }
    concluirAlteracao(edicao.id, dados, false);
  };

  const concluirAlteracao = (id: string, dados: DadosCategoria, aplicar: boolean): void => {
    const r = loja.executar((e, ctx) => alterarCategoria(e, id, dados, aplicar, ctx));
    setPerguntaAplicar(null);
    if (r.ok) {
      setEdicao(null);
      avisar(aplicar ? 'Categoria e despesas do mês aberto atualizadas' : 'Categoria salva');
    } else if (r.erro === 'invalido') setErro(r.mensagem);
  };

  const ativas = estado.categorias.filter((c) => c.ativa);
  const arquivadas = estado.categorias.filter((c) => !c.ativa);

  return (
    <main className="tela">
      <Cabecalho
        titulo="Categorias"
        comVoltar
        acao={
          <button type="button" className="botao-mini" onClick={() => { abrir(); }}>
            <Icone nome="mais" tamanho={16} /> Nova
          </button>
        }
      />
      <p className="ajuda">A divisão padrão é copiada para cada despesa nova e pode ser mudada nela.</p>

      <ul className="lista">
        {ativas.map((c, i) => (
          <li key={c.id} className="item-categoria">
            <button type="button" className="item-categoria-principal" onClick={() => { abrir(c); }}>
              <span className="item-icone" style={{ backgroundColor: `${c.cor}22` }} aria-hidden="true">{c.icone}</span>
              <span className="item-texto">
                <span className="item-titulo">{c.nome}</span>
                <span className="item-detalhe">
                  {nomeA} {formatarPercentual(c.pctA)} · {nomeB} {formatarPercentual(10000 - c.pctA)}
                </span>
              </span>
            </button>
            <span className="item-ordem">
              <button type="button" className="botao-icone" aria-label={`Subir ${c.nome}`} disabled={i === 0}
                onClick={() => { loja.executar((e, ctx) => moverCategoria(e, c.id, -1, ctx)); }}>
                <Icone nome="subir" tamanho={18} />
              </button>
              <button type="button" className="botao-icone" aria-label={`Descer ${c.nome}`} disabled={i === ativas.length - 1}
                onClick={() => { loja.executar((e, ctx) => moverCategoria(e, c.id, 1, ctx)); }}>
                <Icone nome="descer" tamanho={18} />
              </button>
            </span>
          </li>
        ))}
      </ul>

      {arquivadas.length > 0 && (
        <section className="secao">
          <h2>Arquivadas</h2>
          <ul className="lista">
            {arquivadas.map((c) => (
              <li key={c.id} className="item-categoria arquivada">
                <span className="item-categoria-principal">
                  <span className="item-icone" aria-hidden="true">{c.icone}</span>
                  <span className="item-titulo">{c.nome}</span>
                </span>
                <button type="button" className="botao-mini" onClick={() => { loja.executar((e, ctx) => arquivarCategoria(e, c.id, false, ctx)); }}>
                  Reativar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Janela aberta={edicao !== null && perguntaAplicar === null} titulo={edicao?.id ? 'Editar categoria' : 'Nova categoria'} aoFechar={() => { setEdicao(null); }}>
        {edicao && (
          <form className="formulario" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <div className="campo-duplo">
              <div className="campo campo-icone">
                <label htmlFor="cat-icone">Ícone</label>
                <input id="cat-icone" type="text" maxLength={4} value={edicao.icone} onChange={(e) => { setEdicao({ ...edicao, icone: e.target.value }); }} />
              </div>
              <div className="campo">
                <label htmlFor="cat-nome">Nome</label>
                <input id="cat-nome" type="text" maxLength={40} value={edicao.nome} onChange={(e) => { setEdicao({ ...edicao, nome: e.target.value }); }} />
              </div>
            </div>
            <fieldset className="campo">
              <legend>Cor</legend>
              <div className="cores">
                {CORES.map((cor) => (
                  <button key={cor} type="button" className={cor === edicao.cor ? 'cor ativa' : 'cor'} style={{ backgroundColor: cor }}
                    aria-label={`Cor ${cor}`} aria-pressed={cor === edicao.cor} onClick={() => { setEdicao({ ...edicao, cor }); }} />
                ))}
              </div>
            </fieldset>
            <div className="campo">
              <label htmlFor="cat-pct">Divisão padrão: % de {nomeA}</label>
              <div className="linha-pct">
                <input id="cat-pct" type="text" inputMode="decimal" value={edicao.pctTexto} onChange={(e) => { setEdicao({ ...edicao, pctTexto: e.target.value }); }} />
                <span className="sufixo">%</span>
              </div>
              <p className="ajuda">
                {(() => {
                  const p = lerPercentual(edicao.pctTexto);
                  return p === null ? 'De 0 a 100, com até 2 casas.' : `${nomeB}: ${formatarPercentual(10000 - p)}`;
                })()}
              </p>
            </div>
            {erro && <p className="erro" role="alert">{erro}</p>}
            <AcoesJanela>
              {edicao.id && (
                <button type="button" className="botao botao-texto" onClick={() => {
                  const id = edicao.id;
                  if (id) loja.executar((e, ctx) => arquivarCategoria(e, id, true, ctx));
                  setEdicao(null);
                  avisar('Categoria arquivada');
                }}>
                  Arquivar
                </button>
              )}
              <button type="button" className="botao" onClick={() => { setEdicao(null); }}>Cancelar</button>
              <button type="submit" className="botao botao-principal">Salvar</button>
            </AcoesJanela>
          </form>
        )}
      </Janela>

      <Janela aberta={perguntaAplicar !== null} titulo="Aplicar o novo % também às despesas em aberto?" aoFechar={() => { setPerguntaAplicar(null); }}>
        {perguntaAplicar && (
          <>
            <p>
              {perguntaAplicar.quantas === 1 ? 'Há 1 despesa' : `Há ${String(perguntaAplicar.quantas)} despesas`} de meses ainda não acertados usando o % padrão desta categoria.
              Meses já acertados nunca mudam.
            </p>
            <div className="janela-acoes vertical">
              <button type="button" className="botao botao-principal" onClick={() => { concluirAlteracao(perguntaAplicar.id, perguntaAplicar.dados, true); }}>
                Sim, aplicar também a elas
              </button>
              <button type="button" className="botao" onClick={() => { concluirAlteracao(perguntaAplicar.id, perguntaAplicar.dados, false); }}>
                Não, só para despesas novas
              </button>
            </div>
          </>
        )}
      </Janela>
    </main>
  );
}
