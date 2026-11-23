import { useEffect, useState } from 'react';
import { formatarReais } from '../dominio/dinheiro.ts';

function useConectado(): boolean {
  const [conectado, setConectado] = useState(() => navigator.onLine);
  useEffect(() => {
    const ligar = (): void => {
      setConectado(true);
    };
    const desligar = (): void => {
      setConectado(false);
    };
    window.addEventListener('online', ligar);
    window.addEventListener('offline', desligar);
    return () => {
      window.removeEventListener('online', ligar);
      window.removeEventListener('offline', desligar);
    };
  }, []);
  return conectado;
}

function estaInstalado(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function App() {
  const conectado = useConectado();
  const instalado = estaInstalado();

  return (
    <main className="pagina">
      <header className="topo">
        <img className="topo-icone" src={`${import.meta.env.BASE_URL}icone.svg`} alt="" />
        <h1>Viver Gasta</h1>
      </header>

      <section className="cartao">
        <p className="destaque">Olá! 👋</p>
        <p>
          A fundação do app está no ar. As telas de verdade chegam na Fase 1, em modo
          demonstração.
        </p>
        <p className="exemplo">
          Exemplo de valor formatado: <strong>{formatarReais(123456)}</strong>
        </p>
      </section>

      <ul className="estado" aria-label="Estado do app">
        <li>
          <span className={conectado ? 'ponto ponto-ok' : 'ponto ponto-alerta'} aria-hidden="true" />
          {conectado ? 'Conectado à internet' : 'Sem internet — e o app abriu mesmo assim'}
        </li>
        <li>
          <span className={instalado ? 'ponto ponto-ok' : 'ponto'} aria-hidden="true" />
          {instalado ? 'Rodando como app instalado' : 'Rodando no navegador'}
        </li>
      </ul>

      <footer className="rodape">Versão {__VERSAO__}</footer>
    </main>
  );
}
