import { useEffect, useState } from 'react';
import { PIN_MAXIMO, PIN_MINIMO } from '../../cripto/pin.ts';
import { Icone } from '../componentes/Icone.tsx';

/**
 * Teclado numérico próprio para o PIN: botões grandes, sem abrir o teclado do sistema e sem
 * mostrar os números (só bolinhas). No PC, as teclas numéricas também funcionam.
 */
export function TecladoPin({
  titulo,
  ajuda,
  erro,
  ocupado = false,
  aoConfirmar,
}: {
  titulo: string;
  ajuda?: string;
  erro?: string | null;
  ocupado?: boolean;
  aoConfirmar: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (ocupado) return;
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < PIN_MAXIMO ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter' && pin.length >= PIN_MINIMO) {
        setPin('');
        aoConfirmar(pin);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => { window.removeEventListener('keydown', aoTeclar); };
  }, [pin, ocupado, aoConfirmar]);

  const digitar = (d: string): void => { setPin((p) => (p.length < PIN_MAXIMO ? p + d : p)); };

  return (
    <div className="teclado-pin">
      <p className="teclado-titulo">{titulo}</p>
      <div className="pin-bolinhas" aria-label={`${String(pin.length)} números digitados`} role="status">
        {Array.from({ length: Math.max(PIN_MINIMO, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'bolinha cheia' : 'bolinha'} />
        ))}
      </div>
      {erro ? <p className="erro" role="alert">{erro}</p> : ajuda && <p className="ajuda">{ajuda}</p>}
      <div className="teclas">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="tecla" onClick={() => { digitar(d); }} disabled={ocupado}>
            {d}
          </button>
        ))}
        <button type="button" className="tecla tecla-secundaria" aria-label="Apagar" onClick={() => { setPin((p) => p.slice(0, -1)); }} disabled={ocupado}>
          <Icone nome="voltar" />
        </button>
        <button type="button" className="tecla" onClick={() => { digitar('0'); }} disabled={ocupado}>
          0
        </button>
        <button
          type="button"
          className="tecla tecla-ok"
          aria-label="Confirmar"
          onClick={() => {
            // Limpa o que foi digitado: se o PIN estiver errado, começa do zero.
            setPin('');
            aoConfirmar(pin);
          }}
          disabled={ocupado || pin.length < PIN_MINIMO}
        >
          <Icone nome="ok" />
        </button>
      </div>
    </div>
  );
}
