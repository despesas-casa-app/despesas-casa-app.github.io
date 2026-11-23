import { useState } from 'react';
import { useSessao } from '../sessaoContexto.tsx';
import { CriarCofre } from './CriarCofre.tsx';

/** Primeira tela de um aparelho sem cofre: criar o cofre de verdade ou ver a demonstração. */
export function BoasVindas() {
  const sessao = useSessao();
  const [criando, setCriando] = useState(false);
  const [entrando, setEntrando] = useState(false);

  if (criando) return <CriarCofre aoCancelar={() => { setCriando(false); }} />;

  return (
    <main className="tela tela-centro">
      <img className="logo-grande" src={`${import.meta.env.BASE_URL}icone.svg`} alt="" width="96" height="96" />
      <h1 className="titulo-app">Viver Gasta</h1>
      <p className="subtitulo">As despesas da casa, divididas sem planilha e sem briga.</p>

      <div className="acoes-boas-vindas">
        <button type="button" className="botao botao-principal" onClick={() => { setCriando(true); }}>
          Criar nosso cofre
        </button>
        <button
          type="button"
          className="botao"
          disabled={entrando}
          onClick={() => {
            setEntrando(true);
            void sessao.entrarDemo();
          }}
        >
          Ver a demonstração (dados fictícios)
        </button>
      </div>

      <p className="ajuda centro">
        Os dados ficam criptografados no aparelho. A ligação com o Google, para os dois celulares
        conversarem, chega na próxima etapa.
      </p>
    </main>
  );
}
