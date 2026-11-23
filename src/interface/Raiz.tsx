import { useEffect } from 'react';
import { App } from './App.tsx';
import { ProvedorApp } from './contexto.tsx';
import { useEstadoSessao, useSessao } from './sessaoContexto.tsx';
import { BoasVindas } from './telas/BoasVindas.tsx';
import { Desbloquear } from './telas/Desbloquear.tsx';

/** Decide o que mostrar: boas-vindas, tela de bloqueio ou o app aberto. */
export function Raiz() {
  const sessao = useSessao();
  const estado = useEstadoSessao();

  // Bloqueio automático: 1 hora sem uso (especificação 5.4).
  useEffect(() => sessao.vigiar(document), [sessao]);

  switch (estado.fase) {
    case 'iniciando':
      return (
        <main className="tela tela-centro" aria-busy="true">
          <img className="logo-grande" src={`${import.meta.env.BASE_URL}icone.svg`} alt="" width="72" height="72" />
        </main>
      );
    case 'boas-vindas':
      return <BoasVindas />;
    case 'bloqueado':
      return <Desbloquear metodo={estado.metodo} />;
    case 'aberto':
      return (
        <ProvedorApp key={estado.modo} loja={estado.loja}>
          <App />
        </ProvedorApp>
      );
  }
}
