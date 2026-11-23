// Este arquivo exporta o provedor e os "ganchos" juntos de propósito; o aviso de recarga rápida não se aplica.
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Foto, Loja } from '../aplicacao/loja.ts';
import { competenciaDaData, dataLocal } from '../dominio/competencia.ts';
import type { Competencia } from '../dominio/tipos.ts';

const LojaContexto = createContext<Loja | null>(null);

interface MesAtivo {
  readonly mes: Competencia;
  readonly definirMes: (c: Competencia) => void;
}
const MesContexto = createContext<MesAtivo | null>(null);

interface Aviso {
  readonly texto: string;
  readonly id: number;
}
const AvisoContexto = createContext<((texto: string) => void) | null>(null);

export function mesDeHoje(): Competencia {
  return competenciaDaData(dataLocal(new Date()));
}

export function hojeISO(): string {
  return dataLocal(new Date());
}

export function ProvedorApp({ loja, children }: { loja: Loja; children: ReactNode }) {
  const [mes, definirMes] = useState(mesDeHoje);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<number | undefined>(undefined);

  const avisar = useCallback((texto: string) => {
    window.clearTimeout(temporizador.current);
    setAviso({ texto, id: Date.now() });
    temporizador.current = window.setTimeout(() => {
      setAviso(null);
    }, 2600);
  }, []);

  const mesAtivo = useMemo(() => ({ mes, definirMes }), [mes]);

  return (
    <LojaContexto.Provider value={loja}>
      <MesContexto.Provider value={mesAtivo}>
        <AvisoContexto.Provider value={avisar}>
          {children}
          {aviso && (
            <div className="aviso" role="status" key={aviso.id}>
              {aviso.texto}
            </div>
          )}
        </AvisoContexto.Provider>
      </MesContexto.Provider>
    </LojaContexto.Provider>
  );
}

export function useLoja(): Loja {
  const loja = useContext(LojaContexto);
  if (!loja) throw new Error('Loja não disponível');
  return loja;
}

export function useFoto(): Foto {
  const loja = useLoja();
  return useSyncExternalStore(loja.assinar, loja.obterFoto);
}

export function useMes(): MesAtivo {
  const m = useContext(MesContexto);
  if (!m) throw new Error('Mês não disponível');
  return m;
}

/** Mensagem rápida no rodapé ("Despesa salva"). */
export function useAvisar(): (texto: string) => void {
  const a = useContext(AvisoContexto);
  if (!a) throw new Error('Aviso não disponível');
  return a;
}
