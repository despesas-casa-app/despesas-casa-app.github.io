import { formatarReais } from '../../dominio/dinheiro.ts';

/** Gráficos em SVG feito à mão (sem bibliotecas). */

export interface Barra {
  readonly rotulo: string;
  readonly valor: number;
  readonly cor: string;
  readonly icone?: string;
  /** Texto pequeno embaixo da barra (ex.: "▲ 12% vs. outubro"). */
  readonly detalhe?: string;
  readonly aoTocar?: () => void;
}

/** Barras horizontais: uma por linha, com rótulo e valor. */
export function BarrasHorizontais({ barras, titulo }: { barras: readonly Barra[]; titulo: string }) {
  const maximo = Math.max(1, ...barras.map((b) => b.valor));
  const total = barras.reduce((s, b) => s + b.valor, 0);
  return (
    <figure className="grafico">
      <figcaption className="visualmente-oculto">{titulo}</figcaption>
      <ul className="barras-h">
        {barras.map((b) => {
          const conteudo = (
            <>
            <div className="barras-h-texto">
              <span>
                {b.icone && <span aria-hidden="true">{b.icone} </span>}
                {b.rotulo}
              </span>
              <span className="reais">
                {formatarReais(b.valor)}
                <small> · {total > 0 ? Math.round((b.valor / total) * 100) : 0}%</small>
              </span>
            </div>
            <svg className="barras-h-svg" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y="0" width="100" height="6" rx="3" className="trilho" />
              {b.valor > 0 && <rect x="0" y="0" width={Math.max(1.5, (b.valor / maximo) * 100)} height="6" rx="3" fill={b.cor} />}
            </svg>
            {b.detalhe && <small className="barras-h-detalhe">{b.detalhe}</small>}
            </>
          );
          return (
            <li key={b.rotulo}>
              {b.aoTocar ? (
                <button type="button" className="barras-h-botao" onClick={b.aoTocar}>
                  {conteudo}
                </button>
              ) : (
                conteudo
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export interface Coluna {
  readonly rotulo: string;
  /** Partes empilhadas (ex.: quanto cada pessoa pagou). */
  readonly partes: readonly { readonly valor: number; readonly classe: string }[];
  readonly destaque?: boolean;
}

/** Colunas verticais empilhadas (comparação entre meses). */
export function Colunas({ colunas, titulo }: { colunas: readonly Coluna[]; titulo: string }) {
  const largura = 320;
  const altura = 160;
  const base = altura - 22;
  const maximo = Math.max(1, ...colunas.map((c) => c.partes.reduce((s, p) => s + p.valor, 0)));
  const passo = largura / Math.max(1, colunas.length);
  const larguraColuna = Math.min(36, passo * 0.6);
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${String(largura)} ${String(altura)}`} className="colunas-svg" role="img" aria-label={titulo}>
        <line x1="0" x2={largura} y1={base} y2={base} className="eixo" />
        {colunas.map((c, i) => {
          const x = i * passo + (passo - larguraColuna) / 2;
          let y = base;
          const total = c.partes.reduce((s, p) => s + p.valor, 0);
          return (
            <g key={c.rotulo}>
              <title>{`${c.rotulo}: ${formatarReais(total)}`}</title>
              {c.partes.map((p, j) => {
                const h = (p.valor / maximo) * (base - 8);
                y -= h;
                return <rect key={j} x={x} y={y} width={larguraColuna} height={Math.max(0, h)} rx="3" className={p.classe} />;
              })}
              <text x={x + larguraColuna / 2} y={altura - 6} textAnchor="middle" className={c.destaque ? 'rotulo-eixo destaque' : 'rotulo-eixo'}>
                {c.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
