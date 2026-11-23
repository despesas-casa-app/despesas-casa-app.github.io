import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { semearDemonstracao } from './aplicacao/demo.ts';
import { Loja } from './aplicacao/loja.ts';
import { LocalIndexedDb } from './armazenamento/local.ts';
import { App } from './interface/App.tsx';
import { ProvedorApp } from './interface/contexto.tsx';
import { estaEmbutido } from './interface/protecao.ts';
import './interface/estilos.css';

const raiz = document.getElementById('raiz');

if (estaEmbutido(window)) {
  document.body.textContent = 'Por segurança, este app não pode ser aberto dentro de outro site.';
} else if (raiz) {
  // Fase 1: modo demonstração, com banco próprio (separado do banco real das próximas fases).
  const loja = new Loja(new LocalIndexedDb('viver-gasta-demo'));
  createRoot(raiz).render(
    <StrictMode>
      <ProvedorApp loja={loja}>
        <App />
      </ProvedorApp>
    </StrictMode>,
  );
  void loja.iniciar((l) => {
    semearDemonstracao(l);
  });
}
