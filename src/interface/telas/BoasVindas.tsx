import { useState } from 'react';
import { useSessao } from '../sessaoContexto.tsx';
import { CriarCofre } from './CriarCofre.tsx';
import { EntrarNoCofre } from './EntrarNoCofre.tsx';

/** Primeira tela de um aparelho sem cofre: criar o cofre de verdade ou ver a demonstração. */
export function BoasVindas() {
  const sessao = useSessao();
  const [criando, setCriando] = useState(false);
  const [entrandoNoCofre, setEntrandoNoCofre] = useState(false);
  const [entrando, setEntrando] = useState(false);

  if (criando) return <CriarCofre aoCancelar={() => { setCriando(false); }} />;
  if (entrandoNoCofre) return <EntrarNoCofre aoCancelar={() => { setEntrandoNoCofre(false); }} />;

  return (
    <main className="tela tela-centro">
      <img className="logo-grande" src={`${import.meta.env.BASE_URL}icone.svg`} alt="" width="96" height="96" />
      <h1 className="titulo-app">Viver Gasta</h1>
      <p className="subtitulo">As despesas da casa, divididas sem complicação.</p>

      <div className="acoes-boas-vindas">
        <button type="button" className="botao botao-principal" onClick={() => { setCriando(true); }}>
          Criar nosso cofre
        </button>
        {sessao.remoto && (
          <button type="button" className="botao" onClick={() => { setEntrandoNoCofre(true); }}>
            Já temos um cofre: entrar
          </button>
        )}
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
        {sessao.remoto
          ? 'Quem cria o cofre faz isso uma vez só (de preferência no computador). A outra pessoa toca em "Já temos um cofre: entrar".'
          : 'O Google ainda não foi configurado neste app: o cofre fica só neste aparelho.'}
      </p>
    </main>
  );
}
