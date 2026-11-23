/* eslint-disable react-refresh/only-export-components -- provedor e gancho juntos de propósito */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { EstadoSessao, Sessao } from '../aplicacao/sessao.ts';
import type { EstadoSincronizacao, Sincronizador } from '../aplicacao/sincronizacao.ts';

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

const nadaParaAssinar = (): (() => void) => () => undefined;
const semEstado = (): null => null;

/** O sincronizador do cofre aberto (null = sem planilha ou demonstração). */
export function useSincronizador(): Sincronizador | null {
  const e = useEstadoSessao();
  return e.fase === 'aberto' ? e.sync : null;
}

/** Estado da sincronização para a interface (null = sem planilha). */
export function useEstadoSincronizacao(): EstadoSincronizacao | null {
  const sync = useSincronizador();
  return useSyncExternalStore<EstadoSincronizacao | null>(sync ? sync.assinar : nadaParaAssinar, sync ? sync.obter : semEstado);
}
