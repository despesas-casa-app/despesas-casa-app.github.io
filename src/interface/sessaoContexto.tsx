/* eslint-disable react-refresh/only-export-components -- provedor e gancho juntos de propósito */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { EstadoSessao, Sessao } from '../aplicacao/sessao.ts';

const SessaoContexto = createContext<Sessao | null>(null);

export function ProvedorSessao({ sessao, children }: { sessao: Sessao; children: ReactNode }) {
  return <SessaoContexto.Provider value={sessao}>{children}</SessaoContexto.Provider>;
}

export function useSessao(): Sessao {
  const s = useContext(SessaoContexto);
  if (!s) throw new Error('Sessão não disponível');
  return s;
}

export function useEstadoSessao(): EstadoSessao {
  const s = useSessao();
  return useSyncExternalStore(s.assinar, s.obter);
}

/** "real" ou "demo" (só faz sentido com o app aberto). */
export function useModo(): 'real' | 'demo' {
  const e = useEstadoSessao();
  return e.fase === 'aberto' ? e.modo : 'demo';
}
