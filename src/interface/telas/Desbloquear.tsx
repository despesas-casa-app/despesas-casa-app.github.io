import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetodoDesbloqueio } from '../../aplicacao/cofre.ts';
import { Icone } from '../componentes/Icone.tsx';
import { CampoFrase } from '../seguranca/CampoFrase.tsx';
import { ConfigurarDesbloqueio } from '../seguranca/ConfigurarDesbloqueio.tsx';
import { TecladoPin } from '../seguranca/TecladoPin.tsx';
import { useSessao } from '../sessaoContexto.tsx';

/**
 * Tela de bloqueio. Biometria (padrão), PIN (reserva) ou a frase-mestra — esta última sempre
 * disponível, e a única depois de 10 PINs errados.
 */
export function Desbloquear({ metodo }: { metodo: MetodoDesbloqueio | null }) {
  const sessao = useSessao();
  const [modo, setModo] = useState<'principal' | 'frase' | 'reconfigurar'>(metodo ? 'principal' : 'frase');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [frase, setFrase] = useState('');
  const [restantes, setRestantes] = useState<number | null>(null);
  const dekDaFrase = useRef<CryptoKey | null>(null);
  const tentouSozinho = useRef(false);

  const abrirComBiometria = useCallback(async (): Promise<void> => {
    setErro(null);
    setOcupado(true);
    try {
      await sessao.abrir(await sessao.cofre.abrirComBiometria());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A biometria não funcionou.');
    } finally {
      setOcupado(false);
    }
  }, [sessao]);

  // Com biometria, já pede a digital ao abrir (se o navegador recusar sem toque, fica o botão).
  useEffect(() => {
    if (metodo === 'biometria' && !tentouSozinho.current) {
      tentouSozinho.current = true;
      void abrirComBiometria();
    }
  }, [metodo, abrirComBiometria]);

  const abrirComPin = async (pin: string): Promise<void> => {
    setErro(null);
    setOcupado(true);
    try {
      const r = await sessao.cofre.abrirComPin(pin);
      if (r.ok) {
        await sessao.abrir(r.dek);
        return;
      }
      if (r.motivo === 'bloqueado') {
        setModo('frase');
        setErro('Foram 10 PINs errados. Por segurança, o PIN foi desativado: use a frase-mestra.');
        return;
      }
      setRestantes(r.restantes);
      setErro(`PIN errado. ${r.restantes === 1 ? 'Resta 1 tentativa' : `Restam ${String(r.restantes)} tentativas`}.`);
    } finally {
      setOcupado(false);
    }
  };

  const abrirComFrase = async (): Promise<void> => {
    setErro(null);
    setOcupado(true);
    try {
      const r = await sessao.cofre.abrirComFrase(frase);
      if (!r.ok) {
        setErro(r.motivo === 'invalida' ? r.mensagem : 'Essa não é a frase deste cofre. Confira as palavras.');
        return;
      }
      setFrase('');
      if (await sessao.cofre.metodo()) {
        await sessao.abrir(r.dek);
      } else {
        dekDaFrase.current = r.dek;
        setModo('reconfigurar');
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <main className="tela tela-centro tela-bloqueio">
      <img className="logo-grande" src={`${import.meta.env.BASE_URL}icone.svg`} alt="" width="72" height="72" />
      <h1 className="titulo-app">Viver Gasta</h1>

      {modo === 'principal' && metodo === 'biometria' && (
        <>
          <p className="subtitulo">Use a digital para abrir.</p>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="button" className="botao botao-principal botao-grande" disabled={ocupado} onClick={() => { void abrirComBiometria(); }}>
            <Icone nome="cadeado" tamanho={20} /> {ocupado ? 'Aguardando a digital…' : 'Desbloquear'}
          </button>
        </>
      )}

      {modo === 'principal' && metodo === 'pin' && (
        <TecladoPin
          titulo="Digite o seu PIN"
          erro={erro}
          {...(restantes !== null && restantes <= 3 ? { ajuda: 'Depois de 10 erros, só a frase-mestra abre o app.' } : {})}
          ocupado={ocupado}
          aoConfirmar={(pin) => { void abrirComPin(pin); }}
        />
      )}

      {modo === 'frase' && (
        <form className="formulario largura-total" onSubmit={(e) => { e.preventDefault(); void abrirComFrase(); }}>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <CampoFrase valor={frase} aoMudar={setFrase} />
          <button type="submit" className="botao botao-principal" disabled={ocupado}>
            {ocupado ? 'Abrindo…' : 'Abrir com a frase'}
          </button>
          {metodo && (
            <button type="button" className="botao botao-texto" onClick={() => { setErro(null); setModo('principal'); }}>
              Voltar
            </button>
          )}
        </form>
      )}

      {modo === 'reconfigurar' && (
        <section className="largura-total">
          <p className="faixa faixa-info">Frase correta. Agora escolha como abrir o app neste celular no dia a dia.</p>
          <ConfigurarDesbloqueio
            aoUsarBiometria={async () => {
              const dek = dekDaFrase.current;
              if (dek) await sessao.cofre.configurarBiometria(dek, 'Viver Gasta');
            }}
            aoUsarPin={async (pin) => {
              const dek = dekDaFrase.current;
              if (dek) await sessao.cofre.configurarPin(dek, pin);
            }}
            aoConcluir={() => {
              const dek = dekDaFrase.current;
              dekDaFrase.current = null;
              if (dek) void sessao.abrir(dek);
            }}
          />
        </section>
      )}

      {modo === 'principal' && (
        <button type="button" className="botao botao-texto" onClick={() => { setErro(null); setModo('frase'); }}>
          Usar a frase-mestra
        </button>
      )}
    </main>
  );
}
