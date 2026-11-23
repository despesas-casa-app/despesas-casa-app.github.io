import { useState } from 'react';
import { nomeCurtoDaCompetencia, nomeDaCompetencia } from '../../dominio/competencia.ts';
import { proximoMesAberto } from '../../dominio/despesas.ts';
import { formatarReais } from '../../dominio/dinheiro.ts';
import { categoriaPorId, mesFechado, nomeDe, type Parcelamento, type Recorrente } from '../../dominio/estado.ts';
import { cancelarParcelasRestantes, parcelasDe, parcelasRestantes } from '../../dominio/parcelamentos.ts';
import { encerrarRecorrente, excluirRecorrente, pausarRecorrente } from '../../dominio/recorrentes.ts';
import { LIVRO_CASA } from '../../dominio/tipos.ts';
import { AcoesJanela, Cabecalho, Janela, Vazio } from '../componentes/Basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { mesDeHoje, useAvisar, useFoto, useLoja } from '../contexto.tsx';
import { navegar } from '../rotas.ts';

type Acao =
  | { tipo: 'encerrar'; r: Recorrente }
  | { tipo: 'excluir'; r: Recorrente }
  | { tipo: 'cancelar-parcelas'; p: Parcelamento };

function situacao(r: Recorrente, mes: string): string {
  if (r.fim !== null && r.fim < mes) return `encerrada em ${nomeCurtoDaCompetencia(r.fim)}`;
  if (!r.ativa) return 'pausada';
  if (r.fim !== null) return `até ${nomeCurtoDaCompetencia(r.fim)}`;
  return 'ativa';
}

export function Recorrentes() {
  const loja = useLoja();
  const { estado } = useFoto();
  const avisar = useAvisar();
  const [acao, setAcao] = useState<Acao | null>(null);
  const mes = mesDeHoje();
  const recorrentes = estado.recorrentes.filter((r) => !r.excluida).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  const parcelamentos = [...estado.parcelamentos].sort((a, b) => (a.primeiraCompetencia < b.primeiraCompetencia ? 1 : -1));
  // As restantes começam no primeiro mês ainda não acertado a partir de hoje.
  const aPartirDe = mesFechado(estado, LIVRO_CASA, mes) ? proximoMesAberto(estado, LIVRO_CASA, mes) : mes;

  const concluir = (ok: boolean, texto: string): void => {
    setAcao(null);
    if (ok) avisar(texto);
  };

  return (
    <main className="tela">
      <Cabecalho titulo="Recorrentes e parcelas" comVoltar />

      <section className="secao">
        <div className="secao-titulo">
          <h2>Recorrentes</h2>
          <button type="button" className="botao-mini" onClick={() => { navegar({ tela: 'nova', modo: 'recorrente' }); }}>
            <Icone nome="mais" tamanho={16} /> Nova
          </button>
        </div>
        {recorrentes.length === 0 ? (
          <Vazio>Nenhuma despesa recorrente.</Vazio>
        ) : (
          <ul className="lista">
            {recorrentes.map((r) => {
              const cat = categoriaPorId(estado, r.categoriaId);
              const estadoTxt = situacao(r, mes);
              return (
                <li key={r.id} className="cartao-item">
                  <div className="cartao-item-topo">
                    <span className="item-icone" aria-hidden="true">{cat?.icone}</span>
                    <span className="item-texto">
                      <span className="item-titulo">{r.descricao}</span>
                      <span className="item-detalhe">
                        {r.tipoValor === 'fixo' ? formatarReais(r.valor) : 'valor variável'} · dia {r.dia} · {nomeDe(estado.config, r.pagador)}
                      </span>
                    </span>
                    <span className={estadoTxt === 'ativa' ? 'selo selo-ok' : 'selo'}>{estadoTxt}</span>
                  </div>
                  <div className="cartao-item-acoes">
                    <button type="button" className="botao-mini" onClick={() => { navegar({ tela: 'editar-recorrente', id: r.id }); }}>
                      Editar
                    </button>
                    <button type="button" className="botao-mini" onClick={() => {
                      const res = loja.executar((e, ctx) => pausarRecorrente(e, r.id, r.ativa, ctx));
                      concluir(res.ok, r.ativa ? 'Recorrente pausada' : 'Recorrente retomada');
                    }}>
                      {r.ativa ? 'Pausar' : 'Retomar'}
                    </button>
                    {(r.fim === null || r.fim >= mes) && (
                      <button type="button" className="botao-mini" onClick={() => { setAcao({ tipo: 'encerrar', r }); }}>Encerrar</button>
                    )}
                    <button type="button" className="botao-mini perigo" onClick={() => { setAcao({ tipo: 'excluir', r }); }}>Excluir</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="secao">
        <div className="secao-titulo">
          <h2>Parcelamentos</h2>
          <button type="button" className="botao-mini" onClick={() => { navegar({ tela: 'nova', modo: 'parcelado' }); }}>
            <Icone nome="mais" tamanho={16} /> Novo
          </button>
        </div>
        {parcelamentos.length === 0 ? (
          <Vazio>Nenhuma compra parcelada.</Vazio>
        ) : (
          <ul className="lista">
            {parcelamentos.map((p) => {
              const parcelas = parcelasDe(estado, p.id);
              const restantes = parcelasRestantes(estado, p.id, aPartirDe);
              const pagas = parcelas.filter((d) => d.competencia < mes).length;
              const cat = categoriaPorId(estado, p.categoriaId);
              return (
                <li key={p.id} className="cartao-item">
                  <div className="cartao-item-topo">
                    <span className="item-icone" aria-hidden="true">{cat?.icone}</span>
                    <span className="item-texto">
                      <span className="item-titulo">{p.descricao}</span>
                      <span className="item-detalhe">
                        {p.n}x · total {formatarReais(p.valorTotal)} · {nomeDe(estado.config, p.pagador)}
                      </span>
                    </span>
                    <span className={p.status === 'cancelado' ? 'selo' : 'selo selo-ok'}>
                      {p.status === 'cancelado' ? 'cancelado' : `${String(pagas)}/${String(p.n)}`}
                    </span>
                  </div>
                  <div className="progresso" aria-hidden="true">
                    <span style={{ width: `${String(Math.round((pagas / Math.max(1, p.n)) * 100))}%` }} />
                  </div>
                  <div className="cartao-item-acoes">
                    {restantes.length > 0 && (
                      <span className="ajuda">{restantes.length} restante(s) a partir de {nomeCurtoDaCompetencia(aPartirDe)}</span>
                    )}
                    <button type="button" className="botao-mini" onClick={() => { navegar({ tela: 'editar-parcelamento', id: p.id }); }}>
                      Editar
                    </button>
                    {restantes.length > 0 && (
                      <button type="button" className="botao-mini perigo" onClick={() => { setAcao({ tipo: 'cancelar-parcelas', p }); }}>
                        Cancelar restantes
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Janela aberta={acao?.tipo === 'encerrar'} titulo="Encerrar a recorrente?" aoFechar={() => { setAcao(null); }}>
        {acao?.tipo === 'encerrar' && (
          <>
            <p>{acao.r.descricao} deixa de ser lançada depois de {nomeDaCompetencia(mes)}.</p>
            <AcoesJanela>
              <button type="button" className="botao" onClick={() => { setAcao(null); }}>Cancelar</button>
              <button type="button" className="botao botao-principal" onClick={() => {
                const res = loja.executar((e, ctx) => encerrarRecorrente(e, acao.r.id, mes, ctx));
                concluir(res.ok, 'Recorrente encerrada');
              }}>Encerrar</button>
            </AcoesJanela>
          </>
        )}
      </Janela>

      <Janela aberta={acao?.tipo === 'excluir'} titulo="Excluir a recorrente?" aoFechar={() => { setAcao(null); }}>
        {acao?.tipo === 'excluir' && (
          <>
            <p>{acao.r.descricao} para de ser lançada. As despesas já lançadas continuam onde estão.</p>
            <AcoesJanela>
              <button type="button" className="botao" onClick={() => { setAcao(null); }}>Cancelar</button>
              <button type="button" className="botao botao-perigo" onClick={() => {
                const res = loja.executar((e, ctx) => excluirRecorrente(e, acao.r.id, ctx));
                concluir(res.ok, 'Recorrente excluída');
              }}>Excluir</button>
            </AcoesJanela>
          </>
        )}
      </Janela>

      <Janela aberta={acao?.tipo === 'cancelar-parcelas'} titulo="Cancelar as parcelas restantes?" aoFechar={() => { setAcao(null); }}>
        {acao?.tipo === 'cancelar-parcelas' && (
          <>
            <p>
              Use em caso de antecipação ou devolução. As parcelas a partir de {nomeDaCompetencia(aPartirDe)} serão excluídas.
              Se houve antecipação, lance o valor pago como uma despesa nova.
            </p>
            <AcoesJanela>
              <button type="button" className="botao" onClick={() => { setAcao(null); }}>Voltar</button>
              <button type="button" className="botao botao-perigo" onClick={() => {
                const res = loja.executar((e, ctx) => cancelarParcelasRestantes(e, acao.p.id, aPartirDe, ctx));
                concluir(res.ok, 'Parcelas restantes canceladas');
              }}>Cancelar parcelas</button>
            </AcoesJanela>
          </>
        )}
      </Janela>
    </main>
  );
}
