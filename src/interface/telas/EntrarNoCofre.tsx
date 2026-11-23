import { useEffect, useRef, useState } from 'react';
import type { MetaCofre } from '../../aplicacao/cofre.ts';
import { Cabecalho } from '../componentes/Basicos.tsx';
import { CampoFrase } from '../seguranca/CampoFrase.tsx';
import { ConfigurarDesbloqueio } from '../seguranca/ConfigurarDesbloqueio.tsx';
import { useSessao } from '../sessaoContexto.tsx';

type Etapa = 'google' | 'escolher' | 'frase' | 'desbloqueio' | 'baixando';

/**
 * Entrar num cofre que já existe (especificação 5.5): a 2ª pessoa, ou qualquer um dos dois num
 * celular novo. 1. entrar com o Google · 2. escolher a planilha no seletor do Google ·
 * 3. digitar a frase-mestra · 4. biometria (ou PIN) · 5. baixar tudo e conferir a conta.
 */
export function EntrarNoCofre({ aoCancelar }: { aoCancelar: () => void }) {
  const sessao = useSessao();
  const remoto = sessao.remoto;
  const [etapa, setEtapa] = useState<Etapa>('google');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [email, setEmail] = useState('');
  const [planilha, setPlanilha] = useState<{ id: string; nome: string; meta: MetaCofre } | null>(null);
  const [frase, setFrase] = useState('');
  const dek = useRef<CryptoKey | null>(null);

  // Carrega o login do Google antes: o toque precisa abrir a janela do Google na hora.
  useEffect(() => {
    remoto?.preparar().catch(() => undefined);
  }, [remoto]);

  if (!remoto) {
    return (
      <main className="tela tela-formulario">
        <Cabecalho titulo="Entrar no cofre" />
        <p className="faixa faixa-alerta">O Google ainda não foi configurado neste app (Guia 02).</p>
        <button type="button" className="botao" onClick={aoCancelar}>Voltar</button>
      </main>
    );
  }

  const tentar = async (acao: () => Promise<void>): Promise<void> => {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const entrar = (): void => {
    void tentar(async () => {
      await remoto.entrar();
      setEmail(await remoto.emailDaConta());
      setEtapa('escolher');
    });
  };

  const escolher = (): void => {
    void tentar(async () => {
      const escolhida = await remoto.escolherPlanilha();
      if (!escolhida) return;
      const meta = await sessao.lerCofreDaPlanilha(escolhida.id);
      setPlanilha({ ...escolhida, meta });
      setEtapa('frase');
    });
  };

  const conferirFrase = (): void => {
    if (!planilha) return;
    void tentar(async () => {
      const r = await sessao.conferirFrase(planilha.meta, frase);
      if (!r.ok) {
        setErro(r.motivo === 'invalida' ? r.mensagem : 'Essa não é a frase deste cofre. Confira as palavras.');
        return;
      }
      dek.current = r.dek;
      setFrase('');
      setEtapa('desbloqueio');
    });
  };

  const concluir = (): void => {
    const chave = dek.current;
    if (!chave || !planilha) return;
    setEtapa('baixando');
    void tentar(async () => {
      try {
        await sessao.entrarEmCofreExistente(chave, planilha.meta, planilha.id);
      } catch (e) {
        setEtapa('google');
        dek.current = null;
        throw e;
      }
    });
  };

  return (
    <main className="tela tela-formulario">
      <Cabecalho titulo="Entrar no cofre" />

      {etapa === 'google' && (
        <section className="passo">
          <h2>1. Entre com a sua conta Google</h2>
          <p>Use a conta Google que foi combinada na criação do cofre (a planilha foi compartilhada com ela).</p>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="button" className="botao botao-principal" disabled={ocupado} onClick={entrar}>
            {ocupado ? 'Aguardando o Google…' : 'Entrar com o Google'}
          </button>
          <button type="button" className="botao botao-texto" onClick={aoCancelar}>Voltar</button>
        </section>
      )}

      {etapa === 'escolher' && (
        <section className="passo">
          <h2>2. Escolha a planilha</h2>
          <p className="ajuda">Conta: <strong>{email}</strong></p>
          <p>
            Na janela do Google, escolha a planilha <strong>"Viver Gasta (dados criptografados)"</strong>. Ela
            aparece em "Compartilhados comigo" se foi a outra pessoa quem criou.
          </p>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="button" className="botao botao-principal" disabled={ocupado} onClick={escolher}>
            {ocupado ? 'Abrindo…' : 'Escolher a planilha'}
          </button>
          <button type="button" className="botao botao-texto" onClick={aoCancelar}>Voltar</button>
        </section>
      )}

      {etapa === 'frase' && (
        <form className="passo formulario" onSubmit={(e) => { e.preventDefault(); conferirFrase(); }}>
          <h2>3. Digite a frase-mestra</h2>
          <p className="ajuda">Planilha: {planilha?.nome}</p>
          <CampoFrase valor={frase} aoMudar={setFrase} />
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="submit" className="botao botao-principal" disabled={ocupado}>
            {ocupado ? 'Conferindo…' : 'Continuar'}
          </button>
        </form>
      )}

      {etapa === 'desbloqueio' && (
        <section className="passo">
          <h2>4. Como abrir o app neste celular</h2>
          <ConfigurarDesbloqueio
            aoUsarBiometria={async () => {
              if (dek.current) await sessao.cofre.configurarBiometria(dek.current, email || 'Viver Gasta');
            }}
            aoUsarPin={async (pin) => {
              if (dek.current) await sessao.cofre.configurarPin(dek.current, pin);
            }}
            aoConcluir={concluir}
          />
        </section>
      )}

      {etapa === 'baixando' && (
        <section className="passo centro" aria-busy="true">
          <p>Baixando e abrindo os dados…</p>
          {erro && <p className="erro" role="alert">{erro}</p>}
        </section>
      )}
    </main>
  );
}
