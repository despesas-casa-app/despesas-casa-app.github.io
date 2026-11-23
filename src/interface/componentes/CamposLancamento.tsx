import { nomeDe, type Categoria, type Estado } from '../../dominio/estado.ts';
import { formatarPercentual, lerPercentual } from '../../dominio/percentual.ts';
import { categoriasMaisUsadas } from '../../dominio/sugestoes.ts';
import type { Pessoa } from '../../dominio/tipos.ts';
import { pctDe, pctParaTexto } from './percentualTela.ts';

/**
 * Campos comuns às telas de lançamento (despesa, recorrente, parcelamento): categoria e divisão.
 */

/** Categorias ativas (mais a escolhida), das mais usadas para as menos usadas. */
function categoriasOrdenadas(estado: Estado, escolhida: string): Categoria[] {
  const ativas = estado.categorias.filter((c) => c.ativa || c.id === escolhida);
  const ordem = categoriasMaisUsadas(estado);
  return [...ativas].sort((a, b) => {
    const ia = ordem.indexOf(a.id);
    const ib = ordem.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.ordem - b.ordem;
  });
}

export function SeletorCategoria({
  estado,
  valor,
  aoMudar,
}: {
  estado: Estado;
  valor: string;
  aoMudar: (categoriaId: string) => void;
}) {
  return (
    <fieldset className="campo">
      <legend>Categoria</legend>
      <div className="chips">
        {categoriasOrdenadas(estado, valor).map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === valor ? 'chip ativo' : 'chip'}
            aria-pressed={c.id === valor}
            onClick={() => { aoMudar(c.id); }}
          >
            <span aria-hidden="true">{c.icone}</span> {c.nome}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * "Sua parte nesta despesa": mostra o % de quem usa o aparelho. Por dentro, quem chama guarda o
 * % da Pessoa A (use pctADoTexto).
 */
export function CampoDivisao({
  estado,
  euSou,
  categoria,
  pctTexto,
  pctPadrao,
  aoMudar,
  complemento,
}: {
  estado: Estado;
  euSou: Pessoa;
  categoria: Categoria | undefined;
  pctTexto: string;
  pctPadrao: boolean;
  aoMudar: (pctTexto: string, pctPadrao: boolean) => void;
  /** Texto extra no fim da ajuda (ex.: a prévia "Sua parte: R$ …"). */
  complemento?: string | undefined;
}) {
  const meuPct = lerPercentual(pctTexto);
  const outro = euSou === 'A' ? 'B' : 'A';
  const mudarPct = (texto: string): void => {
    const meu = lerPercentual(texto);
    aoMudar(texto, meu !== null && pctDe(euSou, meu) === categoria?.pctA);
  };
  return (
    <div className="campo">
      <label htmlFor="campo-pct">Sua parte nesta despesa ({nomeDe(estado.config, euSou)})</label>
      <div className="linha-pct">
        <input
          id="campo-pct"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={pctTexto}
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
        {categoria && !pctPadrao && (
          <button
            type="button"
            className="botao-mini"
            onClick={() => { aoMudar(pctParaTexto(pctDe(euSou, categoria.pctA)), true); }}
          >
            Voltar ao padrão ({formatarPercentual(pctDe(euSou, categoria.pctA))})
          </button>
        )}
      </div>
      <p id="pct-ajuda" className="ajuda">
        {meuPct === null
          ? 'Use um número de 0 a 100, com até 2 casas.'
          : pctPadrao
            ? `Padrão da categoria ${categoria?.nome ?? ''}.`
            : 'Divisão só desta despesa.'}
        {complemento}
      </p>
    </div>
  );
}
