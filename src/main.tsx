import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './interface/App.tsx';
import { estaEmbutido } from './interface/protecao.ts';
import './interface/estilos.css';

const raiz = document.getElementById('raiz');

if (estaEmbutido(window)) {
  document.body.textContent = 'Por segurança, este app não pode ser aberto dentro de outro site.';
} else if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
