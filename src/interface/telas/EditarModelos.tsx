import { useState } from 'react';
import { nomeCurtoDaCompetencia, nomeDaCompetencia } from '../../dominio/competencia.ts';
import type { Resultado } from '../../dominio/contexto.ts';
import { formatarReais } from '../../dominio/dinheiro.ts';
import {
  categoriaPorId,
  mesFechado,
  rotuloDespesa,
  type Despesa,
  type Estado,
  type Parcelamento,
  type Recorrente,
} from '../../dominio/estado.ts';
import { editarParcelamento, MAXIMO_PARCELAS, valoresDasParcelas } from '../../dominio/parcelamentos.ts';
import { editarRecorrente, ocorrenciasEmAberto } from '../../dominio/recorrentes.ts';
import type { Pessoa } from '../../dominio/tipos.ts';
import { Cabecalho, Segmentos, Vazio } from '../componentes/Basicos.tsx';
import { CampoDivisao, SeletorCategoria } from '../componentes/CamposLancamento.tsx';
import { pctADoTexto, pctDe, pctParaTexto } from '../componentes/percentualTela.ts';
import { CampoValor } from '../componentes/CampoValor.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisar, useFoto, useLoja } from '../contexto.tsx';
import { navegar, voltar } from '../rotas.ts';

/**
 * Edição completa de recorrentes e parcelamentos (tela 7 da especificação).
 * Meses já acertados nunca mudam; as regras ficam no domínio (editarRecorrente, editarParcelamento).
 */

/** Campos que as duas telas têm em comum. */
interface Basicos {
  descricao: string;
  categoriaId: string;
  pagador: Pessoa;
  pctTexto: string;
  pctPadrao: boolean;
}

function CamposBasicos({
  estado,
  euSou,
  f,
  mudar,
  rotuloPagador,
}: {
  estado: Estado;
  euSou: Pessoa;
  f: Basicos;
  mudar: (parcial: Partial<Basicos>) => void;
  rotuloPagador: string;
}) {
  const categoria = categoriaPorId(estado, f.categoriaId);
  return (
    <>
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
          onChange={(e) => { mudar({ descricao: e.target.value }); }}
        />
      </div>

      <SeletorCategoria
        estado={estado}
        valor={f.categoriaId}
        aoMudar={(categoriaId) => {
          const nova = categoriaPorId(estado, categoriaId);
          // Se a divisão seguia a categoria, continua seguindo a nova.
          mudar(f.pctPadrao && nova ? { categoriaId, pctTexto: pctParaTexto(pctDe(euSou, nova.pctA)) } : { categoriaId });
        }}
      />

      <div className="campo">
        <span className="rotulo">{rotuloPagador}</span>
        <Segmentos
          rotulo={rotuloPagador}
          opcoes={[
            { valor: 'A', texto: estado.config.nomeA },
            { valor: 'B', texto: estado.config.nomeB },
          ]}
          valor={f.pagador}
          aoMudar={(pagador) => { mudar({ pagador }); }}
        />
      </div>

      <CampoDivisao
        estado={estado}
        euSou={euSou}
        categoria={categoria}
        pctTexto={f.pctTexto}
        pctPadrao={f.pctPadrao}
        aoMudar={(pctTexto, pctPadrao) => { mudar({ pctTexto, pctPadrao }); }}
      />
    </>
  );
}

function NaoEncontrado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="tela">
      <Cabecalho titulo={titulo} comVoltar />
      <Vazio>{texto}</Vazio>
    </main>
  );
}

function BotaoSalvar() {
  return (
    <div className="barra-salvar">
      <button type="submit" className="botao botao-principal">
        <Icone nome="ok" tamanho={20} /> Salvar
      </button>
    </div>
  );
}

/** Mostra o resultado: avisa e volta, ou mostra o erro. */
function useConcluir(setErro: (e: string | null) => void, mensagem: string): (r: Resultado) => void {
  const avisar = useAvisar();
  return (r) => {
    if (r.ok) {
      avisar(r.eventos.length > 0 ? mensagem : 'Nada mudou');
      voltar();
    } else {
      setErro(r.erro === 'invalido' ? r.mensagem : `${nomeDaCompetencia(r.competencia)} já foi acertado.`);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Recorrente
// ---------------------------------------------------------------------------------------------

interface FormRecorrente extends Basicos {
  tipoValor: 'fixo' | 'variavel';
  valor: number;
  dia: number;
  inicio: string;
  temFim: boolean;
  fim: string;
  aplicar: boolean;
}

function formRecorrente(estado: Estado, euSou: Pessoa, r: Recorrente): FormRecorrente {
  const pctA = r.pctA ?? categoriaPorId(estado, r.categoriaId)?.pctA ?? 5000;
  return {
    descricao: r.descricao,
    categoriaId: r.categoriaId,
    pagador: r.pagador,
    pctTexto: pctParaTexto(pctDe(euSou, pctA)),
    pctPadrao: r.pctA === null,
    tipoValor: r.tipoValor,
    valor: r.valor,
    dia: r.dia,
    inicio: r.inicio,
    temFim: r.fim !== null,
    fim: r.fim ?? r.inicio,
    aplicar: true,
  };
}

export function EditarRecorrente({ id }: { id: string }) {
  const loja = useLoja();
  const { estado, euSou } = useFoto();
  const r = estado.recorrentes.find((x) => x.id === id && !x.excluida);
  const [f, setF] = useState<FormRecorrente | null>(() => (r ? formRecorrente(estado, euSou, r) : null));
  const [erro, setErro] = useState<string | null>(null);
  const concluir = useConcluir(setErro, 'Recorrente atualizada');

  if (!r || !f) return <NaoEncontrado titulo="Recorrente" texto="Recorrente não encontrada (pode ter sido excluída)." />;

  const mudar = (parcial: Partial<FormRecorrente>): void => {
    setErro(null);
    setF({ ...f, ...parcial });
  };
  const lancadas = ocorrenciasEmAberto(estado, id);

  const salvar = (): void => {
    const pctA = pctADoTexto(euSou, f.pctTexto);
    if (pctA === null) {
      setErro('Percentual inválido. Use até 2 casas decimais, de 0 a 100.');
      return;
    }
    const dados = {
      descricao: f.descricao,
      categoriaId: f.categoriaId,
      pagador: f.pagador,
      tipoValor: f.tipoValor,
      valor: f.tipoValor === 'fixo' ? f.valor : 0,
      dia: f.dia,
      inicio: f.inicio,
      fim: f.temFim ? f.fim : null,
      pctA: f.pctPadrao ? null : pctA,
    };
    concluir(loja.executar((e, ctx) => editarRecorrente(e, id, dados, f.aplicar && lancadas.length > 0, ctx)));
  };

  return (
    <main className="tela tela-formulario">
      <Cabecalho titulo="Editar recorrente" comVoltar />
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {!r.ativa && <p className="faixa faixa-info">Pausada: não lança nada até ser retomada.</p>}

        <div className="campo">
          <span className="rotulo">Valor</span>
          <Segmentos
            rotulo="Valor da recorrente"
            opcoes={[
              { valor: 'fixo', texto: 'Valor fixo' },
              { valor: 'variavel', texto: 'Valor muda todo mês' },
            ]}
            valor={f.tipoValor}
            aoMudar={(tipoValor) => { mudar({ tipoValor }); }}
          />
        </div>
        {f.tipoValor === 'fixo' ? (
          <CampoValor id="campo-valor" rotulo="Valor todo mês" centavos={f.valor} aoMudar={(valor) => { mudar({ valor }); }} grande />
        ) : (
          <p className="ajuda">Entra todo mês como "aguardando valor" na tela inicial.</p>
        )}

        <CamposBasicos estado={estado} euSou={euSou} f={f} mudar={mudar} rotuloPagador="Quem paga" />

        <div className="campo">
          <label htmlFor="campo-dia">Vence todo dia</label>
          <input
            id="campo-dia"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={f.dia}
            onChange={(e) => { mudar({ dia: Math.trunc(Number(e.target.value)) || 0 }); }}
          />
          <p className="ajuda">Se o mês não tiver esse dia (ex.: 31 em fevereiro), entra no último dia.</p>
        </div>

        <div className="campo-duplo">
          <div className="campo">
            <label htmlFor="campo-inicio">Começa em</label>
            <input
              id="campo-inicio"
              type="month"
              value={f.inicio}
              onChange={(e) => { if (e.target.value) mudar({ inicio: e.target.value }); }}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="campo-fim">Termina em</label>
            {f.temFim ? (
              <input
                id="campo-fim"
                type="month"
                value={f.fim}
                onChange={(e) => { if (e.target.value) mudar({ fim: e.target.value }); }}
              />
            ) : (
              <input id="campo-fim" type="text" value="Sem data" readOnly onFocus={() => { mudar({ temFim: true }); }} />
            )}
          </div>
        </div>
        <label className="marcar">
          <input type="checkbox" checked={f.temFim} onChange={(e) => { mudar({ temFim: e.target.checked }); }} />
          <span>Tem mês para acabar</span>
        </label>

        {lancadas.length > 0 && (
          <div className="opcoes-extra">
            <label className="marcar">
              <input type="checkbox" checked={f.aplicar} onChange={(e) => { mudar({ aplicar: e.target.checked }); }} />
              <span>
                Atualizar também {lancadas.length === 1 ? 'a despesa já lançada' : `as ${String(lancadas.length)} despesas já lançadas`}{' '}
                ({lancadas.map((d) => nomeCurtoDaCompetencia(d.competencia)).join(', ')})
                <small>
                  O que foi mudado à mão numa delas continua como está. Meses já acertados nunca mudam.
                  {' '}Se o período encolher, as que ficarem de fora são excluídas.
                </small>
              </span>
            </label>
          </div>
        )}
        {lancadas.length === 0 && <p className="ajuda">Vale para os meses que ainda não foram lançados.</p>}

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <BotaoSalvar />
      </form>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Parcelamento
// ---------------------------------------------------------------------------------------------

interface FormParcelamento extends Basicos {
  n: number;
  base: 'total' | 'parcela';
  valor: number;
  dataCompra: string;
  primeira: string;
}

function parcelasDoParcelamento(estado: Estado, id: string): Despesa[] {
  return estado.despesas
    .filter((d) => !d.excluida && d.origem.tipo === 'parcela' && d.origem.id === id)
    .sort((a, b) => (a.origem.tipo === 'parcela' && b.origem.tipo === 'parcela' ? a.origem.k - b.origem.k : 0));
}

function formParcelamento(estado: Estado, euSou: Pessoa, p: Parcelamento): FormParcelamento {
  const categoria = categoriaPorId(estado, p.categoriaId);
  const primeiraViva = parcelasDoParcelamento(estado, p.id)[0];
  return {
    descricao: p.descricao,
    categoriaId: p.categoriaId,
    pagador: p.pagador,
    pctTexto: pctParaTexto(pctDe(euSou, p.pctA)),
    pctPadrao: primeiraViva ? primeiraViva.pctPadrao : p.pctA === categoria?.pctA,
    n: p.n,
    base: 'total',
    valor: p.valorTotal,
    dataCompra: p.dataCompra,
    primeira: p.primeiraCompetencia,
  };
}

export function EditarParcelamento({ id }: { id: string }) {
  const loja = useLoja();
  const { estado, euSou } = useFoto();
  const p = estado.parcelamentos.find((x) => x.id === id);
  const [f, setF] = useState<FormParcelamento | null>(() => (p ? formParcelamento(estado, euSou, p) : null));
  const [erro, setErro] = useState<string | null>(null);
  const concluir = useConcluir(setErro, 'Parcelamento atualizado');

  if (!p || !f) return <NaoEncontrado titulo="Parcelamento" texto="Parcelamento não encontrado." />;

  const mudar = (parcial: Partial<FormParcelamento>): void => {
    setErro(null);
    setF({ ...f, ...parcial });
  };
  const cancelado = p.status === 'cancelado';
  const parcelas = parcelasDoParcelamento(estado, id);
  const acertadas = parcelas.filter((d) => mesFechado(estado, d.livro, d.competencia));
  const somaAcertadas = acertadas.reduce((s, d) => s + d.valor, 0);
  const abertas = Math.max(0, f.n - acertadas.length);

  const trocarBase = (base: 'total' | 'parcela'): void => {
    if (base === f.base) return;
    const n = Math.max(2, f.n);
    mudar(base === 'parcela' ? { base, valor: valoresDasParcelas(f.valor, n)[1] ?? 0 } : { base, valor: f.valor * n });
  };

  // Prévia do que vai ficar.
  let previa = '';
  if (f.valor > 0 && f.n >= 2 && abertas > 0) {
    if (f.base === 'total') {
      const restante = f.valor - somaAcertadas;
      const valores = restante >= abertas ? valoresDasParcelas(restante, abertas) : [];
      previa = valores.length
        ? acertadas.length
          ? `${String(abertas)} parcela(s) em aberto de ${formatarReais(valores[valores.length - 1] ?? 0)} (já acertado: ${formatarReais(somaAcertadas)})`
          : `${String(f.n)}x de ${formatarReais(valores[valores.length - 1] ?? 0)}`
        : '';
    } else {
      previa = `Total de ${formatarReais(somaAcertadas + f.valor * abertas)}`;
    }
  }

  const salvar = (): void => {
    const pctA = pctADoTexto(euSou, f.pctTexto);
    if (pctA === null) {
      setErro('Percentual inválido. Use até 2 casas decimais, de 0 a 100.');
      return;
    }
    const dados = {
      descricao: f.descricao,
      categoriaId: f.categoriaId,
      pagador: f.pagador,
      pctA,
      pctPadrao: f.pctPadrao,
      n: f.n,
      ...(f.base === 'total' ? { valorTotal: f.valor } : { valorParcela: f.valor }),
      dataCompra: f.dataCompra,
      primeiraCompetencia: f.primeira,
    };
    concluir(loja.executar((e, ctx) => editarParcelamento(e, id, dados, ctx)));
  };

  return (
    <main className="tela tela-formulario">
      <Cabecalho titulo="Editar parcelamento" comVoltar />
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {cancelado ? (
          <p className="faixa faixa-info">
            As parcelas restantes foram canceladas. Dá para mudar a descrição, a categoria, quem pagou e a divisão.
          </p>
        ) : (
          acertadas.length > 0 && (
            <p className="faixa faixa-info">As mudanças valem apenas para as parcelas de meses em aberto.</p>
          )
        )}

        {!cancelado && (
          <>
            <div className="campo-duplo">
              <div className="campo">
                <label htmlFor="campo-parcelas">Parcelas</label>
                <input
                  id="campo-parcelas"
                  type="number"
                  inputMode="numeric"
                  min={Math.max(2, acertadas.length)}
                  max={MAXIMO_PARCELAS}
                  value={f.n}
                  onChange={(e) => { mudar({ n: Math.trunc(Number(e.target.value)) || 0 }); }}
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
                  valor={f.base}
                  aoMudar={trocarBase}
                />
              </div>
            </div>
            <CampoValor
              id="campo-valor"
              rotulo={f.base === 'total' ? 'Valor total' : 'Valor de cada parcela'}
              centavos={f.valor}
              aoMudar={(valor) => { mudar({ valor }); }}
              grande
            />
            {previa && <p className="ajuda">{previa}</p>}
          </>
        )}

        <CamposBasicos estado={estado} euSou={euSou} f={f} mudar={mudar} rotuloPagador="Quem pagou" />

        {!cancelado && (
          <div className="campo-duplo">
            <div className="campo">
              <label htmlFor="campo-data">Data da compra</label>
              <input id="campo-data" type="date" value={f.dataCompra} onChange={(e) => { if (e.target.value) mudar({ dataCompra: e.target.value }); }} required />
            </div>
            <div className="campo">
              <label htmlFor="campo-primeira">1ª parcela em</label>
              <input
                id="campo-primeira"
                type="month"
                value={f.primeira}
                disabled={acertadas.length > 0}
                onChange={(e) => { if (e.target.value) mudar({ primeira: e.target.value }); }}
                required
              />
            </div>
          </div>
        )}

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <BotaoSalvar />
      </form>

      {parcelas.length > 0 && (
        <section className="secao">
          <h2>Parcelas hoje</h2>
          <ul className="lista">
            {parcelas.map((d) => {
              const fechado = mesFechado(estado, d.livro, d.competencia);
              return (
                <li key={d.id}>
                  <button type="button" className="item-despesa" onClick={() => { navegar({ tela: 'editar', id: d.id }); }}>
                    <span className="item-texto">
                      <span className="item-titulo">{rotuloDespesa(d)}</span>
                      <span className="item-detalhe">
                        {nomeCurtoDaCompetencia(d.competencia)}
                        {fechado ? ' · acertada' : ''}
                      </span>
                    </span>
                    <span className="item-valor">{formatarReais(d.valor)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
