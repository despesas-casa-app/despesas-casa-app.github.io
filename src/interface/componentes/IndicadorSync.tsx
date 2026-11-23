import { useEffect, useState } from 'react';
import { useFoto } from '../contexto.tsx';

function useConectado(): boolean {
  const [conectado, setConectado] = useState(() => navigator.onLine);
  useEffect(() => {
    const ligar = (): void => { setConectado(true); };
    const desligar = (): void => { setConectado(false); };
    window.addEventListener('online', ligar);
    window.addEventListener('offline', desligar);
    return () => {
      window.removeEventListener('online', ligar);
      window.removeEventListener('offline', desligar);
    };
  }, []);
  return conectado;
}

/**
 * Indicador discreto de estado (especificação 6). No modo demonstração não há sincronização:
 * os dados ficam só neste aparelho. Na Fase 3 ele passa a mostrar
 * sincronizado / pendente (n) / offline / toque para sincronizar.
 */
export function IndicadorSync() {
  const { erroAoSalvar } = useFoto();
  const conectado = useConectado();
  if (erroAoSalvar) return <span className="indicador indicador-erro">Erro ao salvar</span>;
  return (
    <span className="indicador" title="Modo demonstração: dados fictícios, só neste aparelho">
      <span className={conectado ? 'ponto ponto-demo' : 'ponto ponto-offline'} aria-hidden="true" />
      {conectado ? 'Demonstração' : 'Offline · demonstração'}
    </span>
  );
}
