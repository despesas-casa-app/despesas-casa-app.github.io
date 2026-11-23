import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Cofre } from './aplicacao/cofre.ts';
import { Sessao } from './aplicacao/sessao.ts';
import { ArmazemIndexedDb } from './armazenamento/cifrado.ts';
import { LocalIndexedDb } from './armazenamento/local.ts';
import { estaEmbutido } from './interface/protecao.ts';
import { Raiz } from './interface/Raiz.tsx';
import { ProvedorSessao } from './interface/sessaoContexto.tsx';
import './interface/estilos.css';

const raiz = document.getElementById('raiz');

if (estaEmbutido(window)) {
  document.body.textContent = 'Por segurança, este app não pode ser aberto dentro de outro site.';
} else if (raiz) {
  // Banco real (só dados criptografados) e banco da demonstração (fictício), separados.
  const armazem = new ArmazemIndexedDb('viver-gasta');
  const sessao = new Sessao({
    armazem,
    cofre: new Cofre(armazem),
    repositorioDemo: new LocalIndexedDb('viver-gasta-demo'),
  });
  createRoot(raiz).render(
    <StrictMode>
      <ProvedorSessao sessao={sessao}>
        <Raiz />
      </ProvedorSessao>
    </StrictMode>,
  );
  void sessao.iniciar();

  // Atualização do app: quando uma versão nova assume, o app recarrega — mas só quando a pessoa
  // volta para ele (nunca no meio de um lançamento). Recarregar também bloqueia o app.
  if ('serviceWorker' in navigator) {
    // Na primeira instalação não havia versão anterior: isso não é uma atualização.
    const tinhaVersaoAnterior = navigator.serviceWorker.controller !== null;
    let atualizar = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (tinhaVersaoAnterior) atualizar = true;
    });
    document.addEventListener('visibilitychange', () => {
      if (atualizar && document.visibilityState === 'visible') window.location.reload();
    });
  }
}
