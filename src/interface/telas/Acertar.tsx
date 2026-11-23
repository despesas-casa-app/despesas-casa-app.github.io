import { useState } from 'react';
import { formatarData, nomeDaCompetencia } from '../../dominio/competencia.ts';
import { formatarReais } from '../../dominio/dinheiro.ts';
import { fechamentoDe, mesFechado, nomeDe, rotuloDespesa } from '../../dominio/estado.ts';
import { fecharMes, reabrirMes, resumoDoMes } from '../../dominio/fechamento.ts';
import { fraseDoSaldo } from '../../dominio/saldo.ts';
import { LIVRO_CASA } from '../../dominio/tipos.ts';
import { AcoesJanela, Cabecalho, Janela, Reais, SeletorMes } from '../componentes/Basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisar, useFoto, useLoja, useMes } from '../contexto.tsx';
import { navegar } from '../rotas.ts';

export function Acertar() {
  const loja = useLoja();
  const { estado } = useFoto();
  const { mes, definirMes } = useMes();
  const avisar = useAvisar();
  const [confirmar, setConfirmar] = useState<'fechar' | 'reabrir' | null>(null);
  const resumo = resumoDoMes(estado, LIVRO_CASA, mes);
  const fechado = mesFechado(estado, LIVRO_CASA, mes);
  const fechamento = fechamentoDe(estado, LIVRO_CASA, mes);
  const { config } = estado;

  const fechar = (): void => {
    const r = loja.executar((e, ctx) => fecharMes(e, LIVRO_CASA, mes, ctx));
    setConfirmar(null);
    if (r.ok) avisar(`${nomeDaCompetencia(mes)} acertado`);
  };
  const reabrir = (): void => {
    const r = loja.executar((e, ctx) => reabrirMes(e, LIVRO_CASA, mes, ctx));
    setConfirmar(null);
    if (r.ok) avisar(`${nomeDaCompetencia(mes)} reaberto`);
  };

  return (
    <main className="tela">
      <Cabecalho titulo="Acertar contas" />
      <SeletorMes mes={mes} aoMudar={definirMes} />

      {fechado && fechamento ? (
        <section className="cartao-saldo fechado">
          <p className="saldo-rotulo">
            <Icone nome="cadeado" tamanho={16} /> Acertado em {formatarData(fechamento.data)} por {nomeDe(config, fechamento.fechadoPor)}
          </p>
          <p className="saldo-frase">
            {fechamento.transferenciaDe
              ? `${nomeDe(config, fechamento.transferenciaDe)} transferiu ${formatarReais(fechamento.valorTransferencia)} para ${nomeDe(config, fechamento.transferenciaDe === 'A' ? 'B' : 'A')}`
              : 'Ninguém devia nada'}
          </p>
          <p className="ajuda">Total do mês no acerto: {formatarReais(fechamento.totalGasto)}. Meses acertados ficam travados.</p>
          <button type="button" className="botao" onClick={() => { setConfirmar('reabrir'); }}>
            Reabrir {nomeDaCompetencia(mes)}
          </button>
        </section>
      ) : (
        <>
          <section className="cartao-saldo">
            <p className="saldo-rotulo">Transferência para acertar {nomeDaCompetencia(mes)}</p>
            <p className="saldo-frase">{fraseDoSaldo(resumo.transferencia, config)}</p>
          </section>

          <section className="secao cartao">
            <h2>Resumo</h2>
            <dl className="resumo">
              <div><dt>Total gasto</dt><dd><Reais centavos={resumo.totalGasto} /></dd></div>
              <div><dt>Despesas contadas</dt><dd>{resumo.contadas.length}</dd></div>
              <div><dt>{config.nomeA} pagou</dt><dd><Reais centavos={resumo.pagoPor.A} /></dd></div>
              <div><dt>Parte de {config.nomeA}</dt><dd><Reais centavos={resumo.cotaDe.A} /></dd></div>
              <div><dt>{config.nomeB} pagou</dt><dd><Reais centavos={resumo.pagoPor.B} /></dd></div>
              <div><dt>Parte de {config.nomeB}</dt><dd><Reais centavos={resumo.cotaDe.B} /></dd></div>
            </dl>
          </section>

          {resumo.aguardando.length > 0 && (
            <section className="faixa faixa-alerta coluna" role="alert">
              <strong>
                <Icone nome="alerta" tamanho={18} /> {resumo.aguardando.length === 1 ? 'Uma despesa ainda está' : `${String(resumo.aguardando.length)} despesas ainda estão`} aguardando valor
              </strong>
              <ul>
                {resumo.aguardando.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="link" onClick={() => { navegar({ tela: 'editar', id: d.id }); }}>
                      {rotuloDespesa(d)} ({nomeDe(config, d.pagador)})
                    </button>
                  </li>
                ))}
              </ul>
              <small>Elas não entram no acerto. Informe os valores antes, se puder.</small>
            </section>
          )}

          <button
            type="button"
            className="botao botao-principal"
            onClick={() => { setConfirmar('fechar'); }}
            disabled={resumo.contadas.length === 0 && resumo.aguardando.length === 0}
          >
            <Icone nome="cadeado" tamanho={18} /> Confirmar acerto e fechar o mês
          </button>
        </>
      )}

      <Janela aberta={confirmar === 'fechar'} titulo={`Fechar ${nomeDaCompetencia(mes)}?`} aoFechar={() => { setConfirmar(null); }}>
        <p>
          {resumo.transferencia
            ? `Confirme que ${fraseDoSaldo(resumo.transferencia, config).replace(' deve ', ' vai transferir ')}.`
            : 'Ninguém deve nada neste mês.'}{' '}
          Depois de fechado, o mês fica travado (dá para reabrir).
        </p>
        {resumo.aguardando.length > 0 && (
          <p className="erro">Atenção: {resumo.aguardando.length} despesa(s) aguardando valor ficarão de fora.</p>
        )}
        <AcoesJanela>
          <button type="button" className="botao" onClick={() => { setConfirmar(null); }}>
            Cancelar
          </button>
          <button type="button" className="botao botao-principal" onClick={fechar}>
            Fechar o mês
          </button>
        </AcoesJanela>
      </Janela>

      <Janela aberta={confirmar === 'reabrir'} titulo={`Reabrir ${nomeDaCompetencia(mes)}?`} aoFechar={() => { setConfirmar(null); }}>
        <p>O mês volta a aceitar lançamentos e edições. A reabertura fica no histórico, e depois é preciso acertar de novo.</p>
        <AcoesJanela>
          <button type="button" className="botao" onClick={() => { setConfirmar(null); }}>
            Cancelar
          </button>
          <button type="button" className="botao botao-principal" onClick={reabrir}>
            Reabrir
          </button>
        </AcoesJanela>
      </Janela>
    </main>
  );
}
