/* eslint-disable react-refresh/only-export-components -- componentes e ganchos de sincronização juntos de propósito */
import { useEffect, useState } from 'react';
import type { EstadoSincronizacao } from '../../aplicacao/sincronizacao.ts';
import { useAvisar, useFoto } from '../contexto.tsx';
import { useEstadoSincronizacao, useModo, useSessao } from '../sessaoContexto.tsx';

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

/** Texto e cor do indicador (especificação 6: sincronizado / pendente (n) / offline / toque para sincronizar). */
export function descreverSync(e: EstadoSincronizacao): { texto: string; ponto: string } {
  switch (e.tipo) {
    case 'sincronizado':
      return { texto: 'Sincronizado', ponto: 'ponto-ok' };
    case 'sincronizando':
      return { texto: 'Sincronizando…', ponto: 'ponto-demo' };
    case 'pendente':
      return { texto: e.pendentes > 0 ? `Pendente (${String(e.pendentes)})` : 'Sincronizando…', ponto: 'ponto-demo' };
    case 'offline':
      return { texto: e.pendentes > 0 ? `Offline (${String(e.pendentes)})` : 'Offline', ponto: 'ponto-offline' };
    case 'precisa-toque':
      return { texto: 'Toque para sincronizar', ponto: 'ponto-offline' };
    case 'erro':
      return { texto: 'Erro ao sincronizar', ponto: 'ponto-erro' };
  }
}

/** Abre o login do Google dentro do toque e avisa se der errado. */
export function useEntrarNoGoogle(): () => void {
  const sessao = useSessao();
  const avisar = useAvisar();
  return () => {
    sessao.entrarNoGoogle().catch((e: unknown) => {
      avisar(e instanceof Error ? e.message : 'Não foi possível entrar no Google.');
    });
  };
}

/** Indicador discreto de estado, no topo da tela inicial. */
export function IndicadorSync() {
  const { erroAoSalvar } = useFoto();
  const conectado = useConectado();
  const modo = useModo();
  const sync = useEstadoSincronizacao();
  const entrar = useEntrarNoGoogle();

  if (erroAoSalvar) return <span className="indicador indicador-erro">Erro ao salvar</span>;
  if (modo === 'demo') {
    return (
      <span className="indicador" title="Modo demonstração: dados fictícios, só neste aparelho">
        <span className={conectado ? 'ponto ponto-demo' : 'ponto ponto-offline'} aria-hidden="true" />
        {conectado ? 'Demonstração' : 'Offline · demonstração'}
      </span>
    );
  }
  if (!sync) {
    return (
      <span className="indicador" title="Cofre só deste aparelho, sem planilha">
        <span className="ponto ponto-demo" aria-hidden="true" />
        Só neste aparelho
      </span>
    );
  }
  const { texto, ponto } = descreverSync(sync);
  if (sync.tipo === 'precisa-toque') {
    return (
      <button type="button" className="indicador indicador-botao" onClick={entrar}>
        <span className={`ponto ${ponto}`} aria-hidden="true" />
        {texto}
      </button>
    );
  }
  return (
    <span className="indicador" title={sync.tipo === 'erro' ? sync.mensagem : texto} aria-live="polite">
      <span className={`ponto ${ponto}`} aria-hidden="true" />
      {texto}
    </span>
  );
}

/** Faixa no topo quando a sincronização precisa da pessoa (login vencido) ou deu erro. */
export function FaixaSincronizacao() {
  const sync = useEstadoSincronizacao();
  const sessao = useSessao();
  const entrar = useEntrarNoGoogle();
  if (sync?.tipo === 'precisa-toque') {
    return (
      <button type="button" className="faixa-sync" onClick={entrar}>
        Toque para sincronizar
        {sync.pendentes > 0 && <small> · {sync.pendentes} {sync.pendentes === 1 ? 'lançamento esperando' : 'lançamentos esperando'}</small>}
      </button>
    );
  }
  if (sync?.tipo === 'erro') {
    return (
      <button
        type="button"
        className="faixa-sync faixa-sync-erro"
        onClick={() => {
          const s = sessao.obter();
          if (s.fase === 'aberto') void s.sync?.sincronizar();
        }}
      >
        {sync.mensagem} <small>· tentar de novo</small>
      </button>
    );
  }
  return null;
}
