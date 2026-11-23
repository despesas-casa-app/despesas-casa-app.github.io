import { nomeCurtoDaCompetencia, nomeDaCompetencia, nomeDoMes, somarMeses } from '../../dominio/competencia.ts';
import { resumoDoMes } from '../../dominio/fechamento.ts';
import { comparacaoPorCategoria, totaisPorMes, variacao } from '../../dominio/relatorios.ts';
import { LIVRO_CASA } from '../../dominio/tipos.ts';
import { Cabecalho, Reais, SeletorMes, Vazio } from '../componentes/Basicos.tsx';
import { BarrasHorizontais, Colunas } from '../componentes/Graficos.tsx';
import { useFoto, useMes } from '../contexto.tsx';
import { navegar } from '../rotas.ts';

function textoVariacao(total: number, anterior: number, mesAnterior: string): string {
  const v = variacao(total, anterior);
  if (v === null) return anterior === 0 && total > 0 ? `novo em relação a ${mesAnterior}` : '';
  if (v === 0) return `igual a ${mesAnterior}`;
  return `${v > 0 ? '▲' : '▼'} ${String(Math.abs(v))}% vs. ${mesAnterior}`;
}

export function Relatorios() {
  const { estado } = useFoto();
  const { mes, definirMes } = useMes();
  const porCategoria = comparacaoPorCategoria(estado, LIVRO_CASA, mes);
  const mesAnterior = nomeDoMes(somarMeses(mes, -1));
  const meses = totaisPorMes(estado, LIVRO_CASA, mes, 6);
  const resumo = resumoDoMes(estado, LIVRO_CASA, mes);
  const { nomeA, nomeB } = estado.config;
  const media = meses.filter((m) => m.total > 0);
  const mediaValor = media.length ? Math.round(media.reduce((s, m) => s + m.total, 0) / media.length) : 0;

  return (
    <main className="tela">
      <Cabecalho titulo="Relatórios" />
      <SeletorMes mes={mes} aoMudar={definirMes} />

      <section className="secao cartao">
        <h2>Gasto por categoria</h2>
        <p className="ajuda">Toque numa categoria para ver as despesas dela.</p>
        {porCategoria.length === 0 ? (
          <Vazio>Sem despesas em {nomeDaCompetencia(mes)}.</Vazio>
        ) : (
          <BarrasHorizontais
            titulo={`Gasto por categoria em ${nomeDaCompetencia(mes)}`}
            barras={porCategoria.map((g) => ({
              rotulo: g.categoria?.nome ?? 'Sem categoria',
              valor: g.total,
              cor: g.categoria?.cor ?? '#999',
              icone: g.categoria?.icone ?? '',
              detalhe: textoVariacao(g.total, g.anterior, mesAnterior),
              aoTocar: () => { navegar({ tela: 'despesas', categoriaId: g.categoriaId }); },
            }))}
          />
        )}
      </section>

      <section className="secao cartao">
        <h2>Últimos 6 meses</h2>
        <Colunas
          titulo="Total gasto por mês nos últimos 6 meses, dividido por quem pagou"
          colunas={meses.map((m) => ({
            rotulo: nomeCurtoDaCompetencia(m.competencia),
            destaque: m.competencia === mes,
            partes: [
              { valor: m.pagoPor.A, classe: 'cor-a' },
              { valor: m.pagoPor.B, classe: 'cor-b' },
            ],
          }))}
        />
        <p className="legenda">
          <span className="marcador cor-a" /> {nomeA} <span className="marcador cor-b" /> {nomeB}
          {mediaValor > 0 && (
            <>
              {' · '}média <Reais centavos={mediaValor} />
            </>
          )}
        </p>
      </section>

      <section className="secao cartao">
        <h2>Quanto cada um pagou</h2>
        <table className="tabela">
          <thead>
            <tr>
              <th scope="col"><span className="visualmente-oculto">Pessoa</span></th>
              <th scope="col">Pagou</th>
              <th scope="col">Parte dele(a)</th>
              <th scope="col">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {(['A', 'B'] as const).map((p) => {
              const saldo = resumo.pagoPor[p] - resumo.cotaDe[p];
              return (
                <tr key={p}>
                  <th scope="row">{p === 'A' ? nomeA : nomeB}</th>
                  <td><Reais centavos={resumo.pagoPor[p]} /></td>
                  <td><Reais centavos={resumo.cotaDe[p]} /></td>
                  <td className={saldo > 0 ? 'positivo' : saldo < 0 ? 'negativo' : ''}>
                    <Reais centavos={saldo} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="ajuda">Saldo = o que pagou − a parte dele(a) nas despesas. Positivo: tem a receber.</p>
      </section>
    </main>
  );
}
