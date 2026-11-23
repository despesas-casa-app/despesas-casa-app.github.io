import { useEffect, useState } from 'react';
import { biometriaPossivel } from '../../cripto/passkey.ts';
import { validarPin } from '../../cripto/pin.ts';
import { Icone } from '../componentes/Icone.tsx';
import { TecladoPin } from './TecladoPin.tsx';

/**
 * Escolha de como abrir o app neste aparelho: biometria (padrão) ou PIN (só como reserva, quando
 * a biometria não funciona aqui). Especificação 5.4.
 */
export function ConfigurarDesbloqueio({
  aoUsarBiometria,
  aoUsarPin,
  aoConcluir,
}: {
  aoUsarBiometria: () => Promise<void>;
  aoUsarPin: (pin: string) => Promise<void>;
  aoConcluir: () => void;
}) {
  const [possivel, setPossivel] = useState<boolean | null>(null);
  const [etapa, setEtapa] = useState<'escolher' | 'pin' | 'confirmar-pin'>('escolher');
  const [primeiroPin, setPrimeiroPin] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void biometriaPossivel().then((p) => {
      setPossivel(p);
      if (!p) setEtapa('pin');
    });
  }, []);

  const usarBiometria = async (): Promise<void> => {
    setErro(null);
    setOcupado(true);
    try {
      await aoUsarBiometria();
      aoConcluir();
    } catch (e) {
      setErro(`${e instanceof Error ? e.message : 'A biometria não funcionou.'} Você pode tentar de novo ou usar um PIN.`);
    } finally {
      setOcupado(false);
    }
  };

  if (etapa === 'escolher') {
    return (
      <div className="configurar-desbloqueio">
        <p>No dia a dia, o app abre com a sua digital (ou rosto). A frase-mestra não é pedida.</p>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button type="button" className="botao botao-principal" disabled={ocupado || possivel === null} onClick={() => { void usarBiometria(); }}>
          <Icone nome="ok" tamanho={18} /> {ocupado ? 'Aguardando a digital…' : 'Usar a digital'}
        </button>
        <button type="button" className="botao botao-texto" disabled={ocupado} onClick={() => { setErro(null); setEtapa('pin'); }}>
          Este aparelho não tem digital: usar um PIN
        </button>
      </div>
    );
  }

  return (
    <div className="configurar-desbloqueio">
      {possivel === false && etapa === 'pin' && (
        <p className="faixa faixa-info">Este aparelho não oferece biometria compatível. Vamos usar um PIN.</p>
      )}
      <TecladoPin
        key={etapa}
        titulo={etapa === 'pin' ? 'Crie um PIN de 6 ou mais números' : 'Digite o PIN de novo'}
        ajuda={etapa === 'pin' ? 'Evite datas e sequências. Depois de 10 erros, só a frase-mestra abre o app.' : 'Para conferir.'}
        erro={erro}
        ocupado={ocupado}
        aoConfirmar={(pin) => {
          setErro(null);
          if (etapa === 'pin') {
            const problema = validarPin(pin);
            if (problema) {
              setErro(problema);
              return;
            }
            setPrimeiroPin(pin);
            setEtapa('confirmar-pin');
            return;
          }
          if (pin !== primeiroPin) {
            setErro('Os PINs não são iguais. Comece de novo.');
            setEtapa('pin');
            return;
          }
          setOcupado(true);
          void aoUsarPin(pin)
            .then(aoConcluir)
            .catch((e: unknown) => {
              setErro(e instanceof Error ? e.message : 'Não foi possível salvar o PIN.');
              setEtapa('pin');
            })
            .finally(() => { setOcupado(false); });
        }}
      />
      {possivel && (
        <button type="button" className="botao botao-texto" onClick={() => { setErro(null); setEtapa('escolher'); }}>
          Voltar e usar a digital
        </button>
      )}
    </div>
  );
}
