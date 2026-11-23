import { useMemo, useState } from 'react';
import { gerarAtividade } from '../../dominio/atividade.ts';
import { comMaiuscula, competenciaDaData, ehDataValida, formatarData, nomeDaCompetencia } from '../../dominio/competencia.ts';
import type { Resultado } from '../../dominio/contexto.ts';
import { formatarReais } from '../../dominio/dinheiro.ts';
import {
  alterarDespesa,
  criarDespesa,
  excluirDespesa,
  ficouForaDoFechamento,
  proximoMesAberto,
  type DadosDespesa,
} from '../../dominio/despesas.ts';
import { dividir } from '../../dominio/divisao.ts';
import { categoriaPorId, despesaPorId, nomeDe, type Despesa, type Estado } from '../../dominio/estado.ts';
import { reabrirMes } from '../../dominio/fechamento.ts';
import { criarParcelamento, MAXIMO_PARCELAS, valoresDasParcelas } from '../../dominio/parcelamentos.ts';
import { formatarPercentual, lerPercentual } from '../../dominio/percentual.ts';
import { criarRecorrente } from '../../dominio/recorrentes.ts';
import { categoriasMaisUsadas, normalizarTexto, sugerir, type Sugestao } from '../../dominio/sugestoes.ts';
import { LIVRO_CASA, type Competencia, type Pessoa, type PontosBase } from '../../dominio/tipos.ts';
import { AcoesJanela, Cabecalho, Janela, Segmentos, Vazio } from '../componentes/Basicos.tsx';
import { CampoValor } from '../componentes/CampoValor.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { hojeISO, useAvisar, useFoto, useLoja } from '../contexto.tsx';
import { navegar, voltar } from '../rotas.ts';

type Modo = 'unica' | 'parcelado' | 'recorrente';

interface Formulario {
  valor: number;
  descricao: string;
  categoriaId: string;
  pagador: Pessoa;
  pctTexto: string;
  pctPadrao: boolean;
  data: string;
  competencia: Competencia;
  competenciaManual: boolean;
  modo: Modo;
  parcelas: number;
  baseParcela: 'total' | 'parcela';
  tipoValor: 'fixo' | 'variavel';
}

/** Janela de mês fechado: o que fazer com o lançamento. */
interface MesFechadoPendente {
  readonly competencia: Competencia;
  /** Se dá para "mover para o mês em aberto" (despesa nova ou que ficou fora do acerto). */
  readonly podeMover: boolean;
}

/** % de quem usa o aparelho, a partir do % da Pessoa A (e vice-versa: a conta é a mesma). */
function pctDe(euSou: Pessoa, pctA: PontosBase): PontosBase {
  return euSou === 'A' ? pctA : 10000 - pctA;
}

function pctParaTexto(p: PontosBase): string {
  return formatarPercentual(p).replace('%', '');
}

function formularioInicial(estado: Estado, euSou: Pessoa, modo: Modo, existente?: Despesa): Formulario {
  if (existente) {
    return {
      valor: existente.valor,
      descricao: existente.descricao,
      categoriaId: existente.categoriaId,
      pagador: existente.pagador,
      pctTexto: pctParaTexto(pctDe(euSou, existente.pctA)),
      pctPadrao: existente.pctPadrao,
      data: existente.data,
      competencia: existente.competencia,
      competenciaManual: existente.competencia !== competenciaDaData(existente.data),
      modo: 'unica',
      parcelas: 2,
      baseParcela: 'total',
      tipoValor: 'fixo',
    };
  }
  const ativas = estado.categorias.filter((c) => c.ativa);
  const preferida = categoriasMaisUsadas(estado).find((id) => ativas.some((c) => c.id === id)) ?? ativas[0]?.id ?? '';
  const hoje = hojeISO();
  return {
    valor: 0,
    descricao: '',
    categoriaId: preferida,
    pagador: euSou,
    pctTexto: pctParaTexto(pctDe(euSou, categoriaPorId(estado, preferida)?.pctA ?? 5000)),
    pctPadrao: true,
    data: hoje,
    competencia: competenciaDaData(hoje),
    competenciaManual: false,
    modo,
    parcelas: 2,
    baseParcela: 'total',
    tipoValor: 'fixo',
  };
}

export function EditarDespesa({ id, modoInicial = 'unica' }: { id?: string; modoInicial?: Modo }) {
  const loja = useLoja();
  const { estado, euSou } = useFoto();
  const avisar = useAvisar();
  const existente = id ? despesaPorId(estado, id) : undefined;
  const [f, setF] = useState<Formulario>(() => formularioInicial(estado, euSou, modoInicial, existente));
  const [categoriaTocada, setCategoriaTocada] = useState(Boolean(existente));
  const [erro, setErro] = useState<string | null>(null);
  const [mesFechadoPendente, setMesFechadoPendente] = useState<MesFechadoPendente | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  const editando = Boolean(existente);
  const categoria = categoriaPorId(estado, f.categoriaId);
  // O campo mostra "sua parte"; por dentro a despesa guarda o % da Pessoa A.
  const meuPct = lerPercentual(f.pctTexto);
  const pct = meuPct === null ? null : pctDe(euSou, meuPct);
  const textoMeu = (pctA: PontosBase): string => pctParaTexto(pctDe(euSou, pctA));
  const outro = euSou === 'A' ? 'B' : 'A';
  const sugestoes = useMemo(
    () => (mostrarSugestoes && !editando ? sugerir(estado, f.descricao, 4) : []),
    [estado, f.descricao, mostrarSugestoes, editando],
  );
  const historico = useMemo(
    () => (existente ? gerarAtividade(estado.projecao.eventos.filter((e) => e.entidadeId === existente.id), estado.config) : []),
    [estado, existente],
  );

  if (id && !existente) {
    return (
      <main className="tela">
        <Cabecalho titulo="Despesa" comVoltar />
        <Vazio>Despesa não encontrada.</Vazio>
      </main>
    );
  }
  if (existente?.excluida) {
    return (
      <main className="tela">
        <Cabecalho titulo="Despesa excluída" comVoltar />
        <Vazio>Esta despesa foi excluída. O registro continua na Atividade.</Vazio>
      </main>
    );
  }

  const mudar = (parcial: Partial<Formulario>): void => {
    setErro(null);
    setF((atual) => ({ ...atual, ...parcial }));
  };

  const escolherCategoria = (categoriaId: string): void => {
    setCategoriaTocada(true);
    const nova = categoriaPorId(estado, categoriaId);
    mudar(f.pctPadrao && nova ? { categoriaId, pctTexto: textoMeu(nova.pctA) } : { categoriaId });
  };

  const aplicarSugestao = (s: Sugestao): void => {
    const cat = categoriaPorId(estado, s.categoriaId);
    const pctSugerido = s.pctPadrao && cat ? cat.pctA : s.pctA;
    mudar({
      descricao: s.descricao,
      categoriaId: s.categoriaId,
      pagador: s.pagador,
      pctTexto: textoMeu(pctSugerido),
      pctPadrao: s.pctPadrao,
    });
    setMostrarSugestoes(false);
  };

  const digitarDescricao = (descricao: string): void => {
    setMostrarSugestoes(true);
    // Se o texto bate exatamente com algo já lançado, já preenche o resto (sem sobrescrever
    // uma categoria escolhida à mão).
    const exata = !categoriaTocada && !editando
      ? sugerir(estado, descricao, 1).find((s) => normalizarTexto(s.descricao) === normalizarTexto(descricao))
      : undefined;
    if (exata) {
      const cat = categoriaPorId(estado, exata.categoriaId);
      mudar({
        descricao,
        categoriaId: exata.categoriaId,
        pagador: exata.pagador,
        pctTexto: textoMeu(exata.pctPadrao && cat ? cat.pctA : exata.pctA),
        pctPadrao: exata.pctPadrao,
      });
    } else mudar({ descricao });
  };

  const mudarPct = (texto: string): void => {
    const meu = lerPercentual(texto);
    mudar({ pctTexto: texto, pctPadrao: meu !== null && pctDe(euSou, meu) === categoria?.pctA });
  };

  const mudarData = (data: string): void => {
    if (!ehDataValida(data)) {
      mudar({ data });
      return;
    }
    mudar(f.competenciaManual ? { data } : { data, competencia: competenciaDaData(data) });
  };

  // --- Salvar ---

  function montarDados(competencia: Competencia): DadosDespesa | null {
    if (pct === null) {
      setErro('Percentual inválido. Use até 2 casas decimais, de 0 a 100.');
      return null;
    }
    return {
      valor: f.valor,
      descricao: f.descricao,
      data: f.data,
      competencia,
      categoriaId: f.categoriaId,
      pagador: f.pagador,
      pctA: pct,
      pctPadrao: f.pctPadrao,
      ...(existente ? {} : { status: 'normal' as const }),
    };
  }

  function executarSalvar(competencia: Competencia): Resultado | null {
    const dados = montarDados(competencia);
    if (!dados) return null;
    if (existente) {
      return loja.executar((e, ctx) => alterarDespesa(e, existente.id, dados, ctx));
    }
    if (f.modo === 'parcelado') {
      return loja.executar((e, ctx) =>
        criarParcelamento(e, {
          descricao: dados.descricao, categoriaId: dados.categoriaId, pagador: dados.pagador,
          pctA: dados.pctA, pctPadrao: dados.pctPadrao, n: f.parcelas,
          ...(f.baseParcela === 'total' ? { valorTotal: f.valor } : { valorParcela: f.valor }),
          dataCompra: dados.data, primeiraCompetencia: competencia,
        }, ctx),
      );
    }
    if (f.modo === 'recorrente') {
      return loja.executar((e, ctx) =>
        criarRecorrente(e, {
          descricao: dados.descricao, categoriaId: dados.categoriaId, pagador: dados.pagador,
          tipoValor: f.tipoValor, valor: f.tipoValor === 'fixo' ? f.valor : 0,
          dia: Number(dados.data.slice(8, 10)), inicio: competencia, fim: null,
          pctA: dados.pctPadrao ? null : dados.pctA,
        }, ctx),
      );
    }
    return loja.executar((e, ctx) => criarDespesa(e, dados, ctx));
  }

  function tratar(r: Resultado | null, mensagem: string): void {
    if (!r) return;
    if (r.ok) {
      avisar(mensagem);
      voltar();
      return;
    }
    if (r.erro === 'invalido') {
      setErro(r.mensagem);
      return;
    }
    const podeMover = !existente || ficouForaDoFechamento(estado, existente.id) || r.competencia !== existente.competencia;
    setMesFechadoPendente({ competencia: r.competencia, podeMover });
  }

  const textoSalvo = (): string =>
    existente ? 'Alteração salva' : f.modo === 'parcelado' ? 'Parcelas lançadas' : f.modo === 'recorrente' ? 'Recorrente criada' : 'Despesa salva';

  const salvar = (): void => {
    tratar(executarSalvar(f.competencia), textoSalvo());
  };

  const moverParaAberto = (): void => {
    if (!mesFechadoPendente) return;
    const destino = proximoMesAberto(estado, LIVRO_CASA, mesFechadoPendente.competencia);
    setMesFechadoPendente(null);
    mudar({ competencia: destino, competenciaManual: true });
    tratar(executarSalvar(destino), `Lançada em ${nomeDaCompetencia(destino)}`);
  };

  const reabrirESalvar = (): void => {
    if (!mesFechadoPendente) return;
    const c = mesFechadoPendente.competencia;
    setMesFechadoPendente(null);
    const r = loja.executar((e, ctx) => reabrirMes(e, LIVRO_CASA, c, ctx));
    if (!r.ok) return;
    if (confirmarExclusao) {
      excluir();
      return;
    }
    tratar(executarSalvar(f.competencia), `${nomeDaCompetencia(c)} reaberto e despesa salva`);
  };

  const excluir = (): void => {
    if (!existente) return;
    const r = loja.executar((e, ctx) => excluirDespesa(e, existente.id, ctx));
    if (r.ok) {
      setConfirmarExclusao(false);
      avisar('Despesa excluída');
      voltar();
    } else if (r.erro === 'mes-fechado') {
      setMesFechadoPendente({ competencia: r.competencia, podeMover: false });
    }
  };

  // --- Prévia da divisão ---
  const cotas = pct !== null && f.valor > 0 ? dividir(f.modo === 'parcelado' && f.baseParcela === 'total' ? valoresDasParcelas(f.valor, Math.max(2, f.parcelas))[0] ?? f.valor : f.valor, pct, f.pagador) : null;
  const ativas = estado.categorias.filter((c) => c.ativa || c.id === f.categoriaId);
  const ordem = categoriasMaisUsadas(estado);
  const categoriasOrdenadas = [...ativas].sort((a, b) => {
    const ia = ordem.indexOf(a.id);
    const ib = ordem.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.ordem - b.ordem;
  });
  const aguardando = existente?.status === 'aguardando';
  const pedeValor = !(f.modo === 'recorrente' && f.tipoValor === 'variavel');
  const rotuloValor =
    f.modo === 'parcelado' ? (f.baseParcela === 'total' ? 'Valor total' : 'Valor de cada parcela') : 'Valor';

  return (
    <main className="tela tela-formulario">
      <Cabecalho titulo={existente ? 'Editar despesa' : 'Nova despesa'} comVoltar />

      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {existente?.origem.tipo === 'parcela' && (
          <p className="faixa faixa-info">
            Parcela {existente.origem.k} de {existente.origem.n}.{' '}
            <button type="button" className="link" onClick={() => { navegar({ tela: 'recorrentes' }); }}>
              Gerenciar parcelamento
            </button>
          </p>
        )}
        {existente?.origem.tipo === 'recorrente' && (
          <p className="faixa faixa-info">
            Gerada por uma recorrente.{' '}
            <button type="button" className="link" onClick={() => { navegar({ tela: 'recorrentes' }); }}>
              Gerenciar recorrentes
            </button>
          </p>
        )}

        {pedeValor && (
          <CampoValor
            id="campo-valor"
            rotulo={rotuloValor}
            centavos={f.valor}
            aoMudar={(valor) => { mudar({ valor }); }}
            autoFocus={!existente || aguardando}
            grande
          />
        )}

        <div className="campo">
          <label htmlFor="campo-descricao">Descrição</label>
          <input
            id="campo-descricao"
            type="text"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={120}
            value={f.descricao}
            placeholder="Ex.: Mercado"
            onChange={(e) => { digitarDescricao(e.target.value); }}
            onFocus={() => { setMostrarSugestoes(true); }}
          />
          {sugestoes.length > 0 && (
            <ul className="sugestoes" aria-label="Sugestões">
              {sugestoes.map((s) => {
                const cat = categoriaPorId(estado, s.categoriaId);
                return (
                  <li key={s.descricao}>
                    <button type="button" onClick={() => { aplicarSugestao(s); }}>
                      <span aria-hidden="true">{cat?.icone}</span>
                      <strong>{s.descricao}</strong>
                      <small>
                        {cat?.nome} · {nomeDe(estado.config, s.pagador)}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <fieldset className="campo">
          <legend>Categoria</legend>
          <div className="chips">
            {categoriasOrdenadas.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === f.categoriaId ? 'chip ativo' : 'chip'}
                aria-pressed={c.id === f.categoriaId}
                onClick={() => { escolherCategoria(c.id); }}
              >
                <span aria-hidden="true">{c.icone}</span> {c.nome}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="campo">
          <span className="rotulo">Quem pagou</span>
          <Segmentos
            rotulo="Quem pagou"
            opcoes={[
              { valor: 'A', texto: estado.config.nomeA },
              { valor: 'B', texto: estado.config.nomeB },
            ]}
            valor={f.pagador}
            aoMudar={(pagador) => { mudar({ pagador }); }}
          />
        </div>

        <div className="campo">
          <label htmlFor="campo-pct">Sua parte nesta despesa ({nomeDe(estado.config, euSou)})</label>
          <div className="linha-pct">
            <input
              id="campo-pct"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={f.pctTexto}
              onChange={(e) => { mudarPct(e.target.value); }}
              aria-describedby="pct-ajuda"
            />
            <span className="sufixo">%</span>
            <span className="pct-outro">
              {meuPct === null ? '' : `${nomeDe(estado.config, outro)}: ${formatarPercentual(10000 - meuPct)}`}
            </span>
          </div>
          <div className="linha-pct">
            <button type="button" className="botao-mini" onClick={() => { mudarPct('50'); }}>
              Metade cada
            </button>
            {categoria && !f.pctPadrao && (
              <button type="button" className="botao-mini" onClick={() => { mudar({ pctTexto: textoMeu(categoria.pctA), pctPadrao: true }); }}>
                Voltar ao padrão ({formatarPercentual(pctDe(euSou, categoria.pctA))})
              </button>
            )}
          </div>
          <p id="pct-ajuda" className="ajuda">
            {meuPct === null
              ? 'Use um número de 0 a 100, com até 2 casas.'
              : f.pctPadrao
                ? `Padrão da categoria ${categoria?.nome ?? ''}.`
                : 'Divisão só desta despesa.'}
            {cotas &&
              ` Sua parte: ${formatarReais(cotas[euSou])} · parte de ${nomeDe(estado.config, outro)}: ${formatarReais(cotas[outro])}${f.modo === 'parcelado' ? ' (por parcela)' : ''}.`}
          </p>
        </div>

        <div className="campo-duplo">
          <div className="campo">
            <label htmlFor="campo-data">{f.modo === 'parcelado' ? 'Data da compra' : f.modo === 'recorrente' ? '1º vencimento' : 'Data'}</label>
            <input id="campo-data" type="date" value={f.data} onChange={(e) => { mudarData(e.target.value); }} required />
          </div>
          <div className="campo">
            <label htmlFor="campo-competencia">{f.modo === 'parcelado' ? '1ª parcela em' : 'Mês da conta'}</label>
            <input
              id="campo-competencia"
              type="month"
              value={f.competencia}
              onChange={(e) => { if (e.target.value) mudar({ competencia: e.target.value, competenciaManual: true }); }}
              required
            />
          </div>
        </div>

        {!editando && (
          <div className="campo">
            <span className="rotulo">Tipo</span>
            <Segmentos
              rotulo="Tipo de lançamento"
              opcoes={[
                { valor: 'unica', texto: 'Só esta vez' },
                { valor: 'parcelado', texto: 'Parcelado' },
                { valor: 'recorrente', texto: 'Todo mês' },
              ]}
              valor={f.modo}
              aoMudar={(modo) => { mudar({ modo }); }}
            />
            {f.modo === 'parcelado' && (
              <div className="opcoes-extra">
                <div className="campo-duplo">
                  <div className="campo">
                    <label htmlFor="campo-parcelas">Parcelas</label>
                    <input
                      id="campo-parcelas"
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={MAXIMO_PARCELAS}
                      value={f.parcelas}
                      onChange={(e) => { mudar({ parcelas: Math.trunc(Number(e.target.value)) || 0 }); }}
                    />
                  </div>
                  <div className="campo">
                    <span className="rotulo">O valor é</span>
                    <Segmentos
                      rotulo="O valor informado é"
                      opcoes={[
                        { valor: 'total', texto: 'Total' },
                        { valor: 'parcela', texto: 'Parcela' },
                      ]}
                      valor={f.baseParcela}
                      aoMudar={(baseParcela) => { mudar({ baseParcela }); }}
                    />
                  </div>
                </div>
                {f.valor > 0 && f.parcelas >= 2 && (
                  <p className="ajuda">
                    {f.baseParcela === 'total'
                      ? `${String(f.parcelas)}x de ${formatarReais(valoresDasParcelas(f.valor, f.parcelas)[1] ?? 0)}`
                      : `Total de ${formatarReais(f.valor * f.parcelas)}`}
                    {' · '}aparece como "{f.descricao.trim() || 'Compra'} 1/{f.parcelas}"
                  </p>
                )}
              </div>
            )}
            {f.modo === 'recorrente' && (
              <div className="opcoes-extra">
                <Segmentos
                  rotulo="Valor da recorrente"
                  opcoes={[
                    { valor: 'fixo', texto: 'Valor fixo' },
                    { valor: 'variavel', texto: 'Valor muda todo mês' },
                  ]}
                  valor={f.tipoValor}
                  aoMudar={(tipoValor) => { mudar({ tipoValor }); }}
                />
                <p className="ajuda">
                  Todo dia {f.data.slice(8, 10)} entra sozinha no mês certo.
                  {f.tipoValor === 'variavel' && ' Ela aparece como "aguardando valor" na tela inicial.'}
                </p>
              </div>
            )}
          </div>
        )}

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}

        <div className="barra-salvar">
          <button type="submit" className="botao botao-principal">
            <Icone nome="ok" tamanho={20} /> Salvar
          </button>
        </div>
      </form>

      {existente && (
        <>
          <section className="secao">
            <h2>Linha do tempo</h2>
            <ol className="linha-tempo">
              {historico.map((item) => (
                <li key={item.eventoId}>
                  <time>{new Date(item.instante).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
                  {item.textos.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </li>
              ))}
            </ol>
            <p className="ajuda">
              Lançada por {nomeDe(estado.config, existente.criadoPor)}
              {existente.editada && ` · última edição por ${nomeDe(estado.config, existente.alteradoPor)}`}
              {' · '}data {formatarData(existente.data)}
            </p>
          </section>
          <button type="button" className="botao botao-perigo" onClick={() => { setConfirmarExclusao(true); }}>
            <Icone nome="lixeira" tamanho={18} /> Excluir despesa
          </button>
        </>
      )}

      <Janela aberta={confirmarExclusao && !mesFechadoPendente} titulo="Excluir esta despesa?" aoFechar={() => { setConfirmarExclusao(false); }}>
        <p>
          {existente && `${existente.descricao} · ${formatarReais(existente.valor)}`}. A exclusão fica registrada na Atividade.
        </p>
        <AcoesJanela>
          <button type="button" className="botao" onClick={() => { setConfirmarExclusao(false); }}>
            Cancelar
          </button>
          <button type="button" className="botao botao-perigo" onClick={excluir}>
            Excluir
          </button>
        </AcoesJanela>
      </Janela>

      <Janela
        aberta={mesFechadoPendente !== null}
        titulo="Esse mês já está fechado. O que você deseja fazer?"
        aoFechar={() => { setMesFechadoPendente(null); }}
      >
        {mesFechadoPendente && (
          <>
            <p>
                {comMaiuscula(nomeDaCompetencia(mesFechadoPendente.competencia))} já foi acertado.
              {!mesFechadoPendente.podeMover && ' Esta despesa já entrou no acerto; para mudá-la é preciso reabrir o mês.'}
            </p>
            <div className="janela-acoes vertical">
              {mesFechadoPendente.podeMover && (
                <button type="button" className="botao botao-principal" onClick={moverParaAberto}>
                  Mover para o mês em aberto ({nomeDaCompetencia(proximoMesAberto(estado, LIVRO_CASA, mesFechadoPendente.competencia))})
                </button>
              )}
              <button type="button" className="botao" onClick={reabrirESalvar}>
                Reabrir o mês
              </button>
              <button type="button" className="botao botao-texto" onClick={() => { setMesFechadoPendente(null); }}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </Janela>
    </main>
  );
}
