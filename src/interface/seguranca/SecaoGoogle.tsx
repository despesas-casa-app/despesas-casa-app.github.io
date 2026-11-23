import { useState } from 'react';
import { formatarData, dataLocal } from '../../dominio/competencia.ts';
import { nomeDe } from '../../dominio/estado.ts';
import { descreverSync, useEntrarNoGoogle } from '../componentes/IndicadorSync.tsx';
import { useAvisar, useFoto } from '../contexto.tsx';
import { useEstadoSincronizacao, useSessao, useSincronizador } from '../sessaoContexto.tsx';

/** Configurações → Google e sincronização (modo real com planilha). */
export function SecaoGoogle() {
  const sessao = useSessao();
  const sync = useSincronizador();
  const estadoSync = useEstadoSincronizacao();
  const { estado, euSou } = useFoto();
  const entrar = useEntrarNoGoogle();
  const endereco = sessao.enderecoPlanilha;
  // Fica aqui (e não no formulário) para continuar na tela depois que a planilha é ligada.
  const [aviso, setAviso] = useState<string | null>(null);

  if (!sync || !estadoSync) return <ConectarAoGoogle aoConectar={setAviso} />;

  const { texto } = descreverSync(estadoSync);
  const meuEmail = euSou === 'A' ? estado.config.emailA : estado.config.emailB;
  const quando =
    estadoSync.tipo === 'sincronizado'
      ? ` em ${formatarData(dataLocal(new Date(estadoSync.em)))} às ${new Date(estadoSync.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : '';

  return (
    <section className="secao cartao">
      <h2>Google e sincronização</h2>
      {aviso && <p className="faixa">{aviso}</p>}
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

/** Cofre criado só no aparelho: liga à planilha do Google depois. */
function ConectarAoGoogle({ aoConectar }: { aoConectar: (aviso: string) => void }) {
  const sessao = useSessao();
  const { estado, euSou } = useFoto();
  const avisar = useAvisar();
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const outroNome = nomeDe(estado.config, euSou === 'A' ? 'B' : 'A');

  if (!sessao.remoto) {
    return (
      <section className="secao cartao">
        <h2>Google e sincronização</h2>
        <p className="ajuda">Este cofre está só neste celular. A ligação com o Google ainda não foi configurada neste app.</p>
      </section>
    );
  }

  const conectar = (): void => {
    setErro(null);
    setOcupado(true);
    // Chamado direto no toque: a janela de login do Google abre na hora.
    sessao
      .conectarPlanilha(email)
      .then((r) => {
        avisar('Planilha criada; sincronizando');
        aoConectar(
          r.compartilhou
            ? `A planilha foi compartilhada com ${r.email}. No celular de ${outroNome}: abrir o app, tocar em "Já temos um cofre: entrar", entrar com essa conta Google, escolher a planilha "Viver Gasta" e digitar a frase-mestra.`
            : `Não consegui compartilhar a planilha com ${r.email}. Abra a planilha (botão abaixo) e compartilhe com esse e-mail, como editor(a).`,
        );
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : 'Não foi possível conectar ao Google.');
      })
      .finally(() => {
        setOcupado(false);
      });
  };

  return (
    <section className="secao cartao">
      <h2>Google e sincronização</h2>
      <p className="ajuda">
        Este cofre está só neste celular. Para sincronizar com {outroNome}, ligue-o a uma planilha no seu Google Drive: as
        despesas sobem criptografadas.
      </p>
      <div className="campo">
        <label htmlFor="email-outro">E-mail Google de {outroNome}</label>
        <input
          id="email-outro"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
        />
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <button type="button" className="botao botao-principal" disabled={ocupado} onClick={conectar}>
        {ocupado ? 'Conectando…' : 'Conectar à planilha do Google'}
      </button>
    </section>
  );
}
