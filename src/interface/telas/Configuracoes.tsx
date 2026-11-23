import { useState } from 'react';
import { semearDemonstracao } from '../../aplicacao/demo.ts';
import { definirNomes } from '../../dominio/config.ts';
import { AcoesJanela, Cabecalho, Janela, Segmentos } from '../componentes/Basicos.tsx';
import { useAvisar, useFoto, useLoja } from '../contexto.tsx';
import { navegar } from '../rotas.ts';
import { SecaoSeguranca } from '../seguranca/SecaoSeguranca.tsx';
import { useModo, useSessao } from '../sessaoContexto.tsx';

export function Configuracoes() {
  const loja = useLoja();
  const { estado, euSou } = useFoto();
  const avisar = useAvisar();
  const modo = useModo();
  const sessao = useSessao();
  const [nomeA, setNomeA] = useState(estado.config.nomeA);
  const [nomeB, setNomeB] = useState(estado.config.nomeB);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarRecomeco, setConfirmarRecomeco] = useState(false);

  const salvarNomes = (): void => {
    const r = loja.executar((e, ctx) => definirNomes(e, nomeA, nomeB, ctx));
    if (r.ok) {
      setErro(null);
      avisar('Nomes salvos');
    } else if (r.erro === 'invalido') setErro(r.mensagem);
  };

  return (
    <main className="tela">
      <Cabecalho titulo="Configurações" comVoltar />

      <section className="secao cartao">
        <h2>Nomes</h2>
        <form className="formulario" onSubmit={(e) => { e.preventDefault(); salvarNomes(); }}>
          <div className="campo-duplo">
            <div className="campo">
              <label htmlFor="nome-a">Pessoa A</label>
              <input id="nome-a" type="text" maxLength={30} value={nomeA} onChange={(e) => { setNomeA(e.target.value); }} />
            </div>
            <div className="campo">
              <label htmlFor="nome-b">Pessoa B</label>
              <input id="nome-b" type="text" maxLength={30} value={nomeB} onChange={(e) => { setNomeB(e.target.value); }} />
            </div>
          </div>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="submit" className="botao">Salvar nomes</button>
        </form>
      </section>

      <section className="secao cartao">
        <h2>Quem usa este aparelho</h2>
        <p className="ajuda">Define quem aparece como "quem pagou" nas despesas novas e quem fez cada alteração.</p>
        <Segmentos
          rotulo="Quem usa este aparelho"
          opcoes={[
            { valor: 'A', texto: estado.config.nomeA },
            { valor: 'B', texto: estado.config.nomeB },
          ]}
          valor={euSou}
          aoMudar={(p) => { void loja.definirEuSou(p).then(() => { avisar('Pronto'); }); }}
        />
      </section>

      {modo === 'real' && <SecaoSeguranca />}

      <section className="secao cartao">
        <h2>Dados</h2>
        <ul className="lista-links">
          <li>
            <button type="button" className="link-linha" onClick={() => { navegar({ tela: 'categorias' }); }}>Categorias</button>
          </li>
          <li><span className="link-linha desativado">Exportar backup legível · Fase 4</span></li>
          <li><span className="link-linha desativado">Importar do Tricount · Fase 4</span></li>
        </ul>
      </section>

      {modo === 'demo' && (
        <section className="secao cartao">
          <h2>Modo demonstração</h2>
          <p className="ajuda">Tudo aqui é fictício e fica só neste aparelho. Não digite dados reais na demonstração.</p>
          <div className="lista-botoes">
            <button type="button" className="botao" onClick={() => { setConfirmarRecomeco(true); }}>
              Recomeçar com dados de exemplo
            </button>
            <button type="button" className="botao" onClick={() => { void sessao.sairDemo(); }}>
              Sair da demonstração
            </button>
          </div>
        </section>
      )}

      <section className="secao cartao sobre">
        <h2>Sobre</h2>
        <p>
          <strong>Viver Gasta</strong> · versão {__VERSAO__}
        </p>
        <p className="ajuda">O nome vem de uma frase de Ida Feldman. Sem anúncios, sem rastreadores.</p>
      </section>

      <Janela aberta={confirmarRecomeco} titulo="Recomeçar a demonstração?" aoFechar={() => { setConfirmarRecomeco(false); }}>
        <p>Apaga tudo o que foi feito na demonstração neste aparelho e cria os dados de exemplo de novo.</p>
        <AcoesJanela>
          <button type="button" className="botao" onClick={() => { setConfirmarRecomeco(false); }}>Cancelar</button>
          <button type="button" className="botao botao-perigo" onClick={() => {
            setConfirmarRecomeco(false);
            void loja.apagarTudo((l) => { semearDemonstracao(l); }).then(() => {
              setNomeA(loja.obterFoto().estado.config.nomeA);
              setNomeB(loja.obterFoto().estado.config.nomeB);
              avisar('Demonstração reiniciada');
            });
          }}>Recomeçar</button>
        </AcoesJanela>
      </Janela>
    </main>
  );
}
