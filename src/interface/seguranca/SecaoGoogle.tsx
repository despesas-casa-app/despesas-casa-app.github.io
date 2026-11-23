import { formatarData, dataLocal } from '../../dominio/competencia.ts';
import { descreverSync, useEntrarNoGoogle } from '../componentes/IndicadorSync.tsx';
import { useFoto } from '../contexto.tsx';
import { useEstadoSincronizacao, useSessao, useSincronizador } from '../sessaoContexto.tsx';

/** Configurações → Google e sincronização (modo real com planilha). */
export function SecaoGoogle() {
  const sessao = useSessao();
  const sync = useSincronizador();
  const estadoSync = useEstadoSincronizacao();
  const { estado, euSou } = useFoto();
  const entrar = useEntrarNoGoogle();
  const endereco = sessao.enderecoPlanilha;

  if (!sync || !estadoSync) {
    return (
      <section className="secao cartao">
        <h2>Google e sincronização</h2>
        <p className="ajuda">Este cofre está só neste celular (criado sem a planilha do Google).</p>
      </section>
    );
  }

  const { texto } = descreverSync(estadoSync);
  const meuEmail = euSou === 'A' ? estado.config.emailA : estado.config.emailB;
  const quando =
    estadoSync.tipo === 'sincronizado'
      ? ` em ${formatarData(dataLocal(new Date(estadoSync.em)))} às ${new Date(estadoSync.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : '';

  return (
    <section className="secao cartao">
      <h2>Google e sincronização</h2>
      <p className="ajuda">
        Situação: <strong>{texto}</strong>
        {quando}
        {estadoSync.tipo === 'erro' && ` — ${estadoSync.mensagem}`}
      </p>
      {meuEmail && <p className="ajuda">Conta Google deste celular: {meuEmail}</p>}
      {sync.ilegiveis > 0 && (
        <p className="faixa faixa-alerta">
          {sync.ilegiveis} {sync.ilegiveis === 1 ? 'linha da planilha não abriu' : 'linhas da planilha não abriram'} com a
          chave deste cofre e {sync.ilegiveis === 1 ? 'foi ignorada' : 'foram ignoradas'}. Alguém pode ter editado a
          planilha à mão.
        </p>
      )}
      <div className="lista-botoes">
        <button
          type="button"
          className="botao"
          onClick={() => {
            if (estadoSync.tipo === 'precisa-toque') entrar();
            else void sync.sincronizar();
          }}
        >
          Sincronizar agora
        </button>
        {endereco && (
          <a className="botao" href={endereco} target="_blank" rel="noopener noreferrer">
            Abrir a planilha no Google
          </a>
        )}
      </div>
      <p className="ajuda">
        Na planilha só aparecem códigos embaralhados: as despesas são criptografadas antes de sair do celular. Não edite
        nem apague nada nela.
      </p>
    </section>
  );
}
