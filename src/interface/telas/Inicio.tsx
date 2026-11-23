import { comMaiuscula, formatarData, nomeDaCompetencia, nomeDoMes } from '../../dominio/competencia.ts';
import { formatarReais } from '../../dominio/dinheiro.ts';
import { despesasDoMes, fechamentoDe, mesFechado, nomeDe, rotuloDespesa } from '../../dominio/estado.ts';
import { resumoDoMes } from '../../dominio/fechamento.ts';
import { fraseDoSaldo } from '../../dominio/saldo.ts';
import { LIVRO_CASA } from '../../dominio/tipos.ts';
import { Reais, SeletorMes, Vazio } from '../componentes/Basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { ItemDespesa } from '../componentes/ItemDespesa.tsx';
import { IndicadorSync } from '../componentes/IndicadorSync.tsx';
import { mesDeHoje, useFoto, useMes } from '../contexto.tsx';
import { navegar } from '../rotas.ts';

export function Inicio() {
  const { estado } = useFoto();
  const { mes, definirMes } = useMes();
  const resumo = resumoDoMes(estado, LIVRO_CASA, mes);
  const fechamento = fechamentoDe(estado, LIVRO_CASA, mes);
  const fechado = mesFechado(estado, LIVRO_CASA, mes);
  const ultimos = despesasDoMes(estado, LIVRO_CASA, mes).filter((d) => d.status === 'normal').slice(0, 6);

  // Meses anteriores com despesas que ainda não foram acertados.
  const hoje = mesDeHoje();
  const semAcerto = [...new Set(estado.despesas.filter((d) => !d.excluida && d.competencia < hoje).map((d) => d.competencia))]
    .filter((c) => !mesFechado(estado, LIVRO_CASA, c))
    .sort();

  return (
    <main className="tela">
      <header className="inicio-topo">
        <div className="marca">
          <img src={`${import.meta.env.BASE_URL}icone.svg`} alt="" width="36" height="36" />
          <span>Viver Gasta</span>
        </div>
        <IndicadorSync />
      </header>

      <SeletorMes mes={mes} aoMudar={definirMes} />

      <section className={fechado ? 'cartao-saldo fechado' : 'cartao-saldo'} aria-live="polite">
        {fechado && fechamento ? (
          <>
            <p className="saldo-rotulo">
              <Icone nome="cadeado" tamanho={16} /> Mês acertado em {formatarData(fechamento.data)}
            </p>
            <p className="saldo-frase">
              {fechamento.importado
              ? 'Mês trazido do Tricount, onde já estava acertado'
              : fechamento.transferenciaDe
                ? `${nomeDe(estado.config, fechamento.transferenciaDe)} transferiu ${formatarReais(fechamento.valorTransferencia)} para ${nomeDe(estado.config, fechamento.transferenciaDe === 'A' ? 'B' : 'A')}`
                : 'Ninguém devia nada'}
            </p>
          </>
        ) : (
          <>
            <p className="saldo-rotulo">Saldo de {nomeDoMes(mes)}</p>
            <p className="saldo-frase">{fraseDoSaldo(resumo.transferencia, estado.config)}</p>
          </>
        )}
        <dl className="saldo-detalhes">
          <div>
            <dt>Total do mês</dt>
            <dd><Reais centavos={resumo.totalGasto} /></dd>
          </div>
          <div>
            <dt>{estado.config.nomeA} pagou</dt>
            <dd><Reais centavos={resumo.pagoPor.A} /></dd>
          </div>
          <div>
            <dt>{estado.config.nomeB} pagou</dt>
            <dd><Reais centavos={resumo.pagoPor.B} /></dd>
          </div>
        </dl>
        {!fechado && resumo.totalJaAcertado > 0 && (
          <p className="saldo-nota">
            {formatarReais(resumo.totalJaAcertado)} deste mês já foram acertados no Tricount e não entram no saldo.
          </p>
        )}
        {!fechado && (
          <button type="button" className="botao botao-secundario" onClick={() => { navegar({ tela: 'acertar' }); }}>
            <Icone nome="acerto" tamanho={18} /> Acertar contas
          </button>
        )}
      </section>

      {semAcerto.filter((c) => c !== mes).map((c) => (
        <button
          key={c}
          type="button"
          className="faixa faixa-alerta"
          onClick={() => { definirMes(c); navegar({ tela: 'acertar' }); }}
        >
          <Icone nome="alerta" tamanho={18} />
          <span>{comMaiuscula(nomeDaCompetencia(c))} ainda não foi acertado</span>
          <Icone nome="direita" tamanho={18} />
        </button>
      ))}

      {resumo.aguardando.length > 0 && (
        <section className="secao">
          <h2>Aguardando valor</h2>
          <ul className="lista">
            {resumo.aguardando.map((d) => (
              <li key={d.id}>
                <button type="button" className="item-pendente" onClick={() => { navegar({ tela: 'editar', id: d.id }); }}>
                  <span>
                    <strong>{rotuloDespesa(d)}</strong>
                    <small>pago por {nomeDe(estado.config, d.pagador)} · vence {formatarData(d.data).slice(0, 5)}</small>
                  </span>
                  <span className="botao-mini">Informar valor</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="secao">
        <div className="secao-titulo">
          <h2>Últimos lançamentos</h2>
          <button type="button" className="link" onClick={() => { navegar({ tela: 'despesas' }); }}>
            Ver todos
          </button>
        </div>
        {ultimos.length === 0 ? (
          <Vazio>Nenhuma despesa em {nomeDaCompetencia(mes)}.</Vazio>
        ) : (
          <ul className="lista">
            {ultimos.map((d) => (
              <ItemDespesa key={d.id} despesa={d} estado={estado} mostrarData />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
