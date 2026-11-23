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
}
