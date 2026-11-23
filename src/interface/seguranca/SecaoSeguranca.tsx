import { useEffect, useState } from 'react';
import type { MetodoDesbloqueio } from '../../aplicacao/cofre.ts';
import { gerarFrase, reconhecerPalavra } from '../../cripto/frase.ts';
import { nomeDe } from '../../dominio/estado.ts';
import { AcoesJanela, Janela } from '../componentes/Basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisar, useFoto } from '../contexto.tsx';
import { useSessao } from '../sessaoContexto.tsx';
import { CampoFrase } from './CampoFrase.tsx';
import { ConfigurarDesbloqueio } from './ConfigurarDesbloqueio.tsx';

type Janelas = null | 'metodo' | 'frase' | 'apagar';
type PassoFrase = 'atual' | 'nova' | 'conferir';

/** Configurações → Segurança (modo real): bloquear, desbloqueio, trocar a frase, apagar o aparelho. */
export function SecaoSeguranca() {
  const sessao = useSessao();
  const { estado, euSou } = useFoto();
  const avisar = useAvisar();
  const [metodo, setMetodo] = useState<MetodoDesbloqueio | null>(null);
  const [janela, setJanela] = useState<Janelas>(null);

  // Troca de frase
  const [passo, setPasso] = useState<PassoFrase>('atual');
  const [fraseAtual, setFraseAtual] = useState('');
  const [nova, setNova] = useState<readonly string[]>([]);
  const [conferencia, setConferencia] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [textoApagar, setTextoApagar] = useState('');

  useEffect(() => {
    void sessao.cofre.metodo().then(setMetodo);
  }, [sessao, janela]);

  const fechar = (): void => {
    setJanela(null);
    setPasso('atual');
    setFraseAtual('');
    setNova([]);
    setConferencia({});
    setErro(null);
    setTextoApagar('');
  };

  const posicoesConferir = [2, 5, 7];

  const salvarNovaFrase = async (): Promise<void> => {
    if (!posicoesConferir.every((p) => reconhecerPalavra(conferencia[p] ?? '') === nova[p - 1])) {
      setErro('Alguma palavra não confere com a frase nova.');
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const r = await sessao.cofre.trocarFrase(fraseAtual, nova);
      if (!r.ok) {
        setErro('A frase atual não confere. Nada foi mudado.');
        setPasso('atual');
        return;
      }
      fechar();
      avisar('Frase-mestra trocada. Guarde a nova e descarte a antiga.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="secao cartao">
      <h2>Segurança</h2>
      <p className="ajuda">
        Este celular abre com: <strong>{metodo === 'biometria' ? 'digital' : metodo === 'pin' ? 'PIN' : '—'}</strong>. O app se
        bloqueia sozinho depois de 5 minutos fora da tela.
      </p>
      <div className="lista-botoes">
        <button type="button" className="botao" onClick={() => { void sessao.bloquear(); }}>
          <Icone nome="cadeado" tamanho={18} /> Bloquear agora
        </button>
        <button type="button" className="botao" onClick={() => { setJanela('metodo'); }}>
          Mudar como o app abre
        </button>
        <button type="button" className="botao" onClick={() => { setJanela('frase'); }}>
          Trocar a frase-mestra
        </button>
        <button type="button" className="botao botao-perigo" onClick={() => { setJanela('apagar'); }}>
          Apagar os dados deste celular
        </button>
      </div>

      <Janela aberta={janela === 'metodo'} titulo="Como abrir o app neste celular" aoFechar={fechar}>
        {janela === 'metodo' && (
          <>
            <ConfigurarDesbloqueio
              aoUsarBiometria={() => sessao.configurarBiometria(nomeDe(estado.config, euSou))}
              aoUsarPin={(pin) => sessao.configurarPin(pin)}
              aoConcluir={() => {
                fechar();
                avisar('Pronto: forma de desbloqueio atualizada');
              }}
            />
            <AcoesJanela>
              <button type="button" className="botao botao-texto" onClick={fechar}>Cancelar</button>
            </AcoesJanela>
          </>
        )}
      </Janela>

      <Janela aberta={janela === 'frase'} titulo="Trocar a frase-mestra" aoFechar={fechar}>
        {janela === 'frase' && passo === 'atual' && (
          <form className="formulario" onSubmit={(e) => {
            e.preventDefault();
            setOcupado(true);
            setErro(null);
            void sessao.cofre.abrirComFrase(fraseAtual).then((r) => {
              setOcupado(false);
              if (!r.ok) {
                setErro(r.motivo === 'invalida' ? r.mensagem : 'Essa não é a frase atual.');
                return;
              }
              setNova(gerarFrase());
              setPasso('nova');
            });
          }}>
            <p>Para trocar, primeiro digite a frase atual.</p>
            <CampoFrase valor={fraseAtual} aoMudar={setFraseAtual} id="frase-atual" />
            {erro && <p className="erro" role="alert">{erro}</p>}
            <AcoesJanela>
              <button type="button" className="botao" onClick={fechar}>Cancelar</button>
              <button type="submit" className="botao botao-principal" disabled={ocupado}>{ocupado ? 'Conferindo…' : 'Continuar'}</button>
            </AcoesJanela>
          </form>
        )}
        {janela === 'frase' && passo === 'nova' && (
          <>
            <p>Esta é a nova frase. Anote e guarde no lugar da antiga.</p>
            <ol className="frase-mostrada">
              {nova.map((p, i) => (
                <li key={i}><span>{i + 1}</span> {p}</li>
              ))}
            </ol>
            <AcoesJanela>
              <button type="button" className="botao" onClick={fechar}>Cancelar</button>
              <button type="button" className="botao botao-principal" onClick={() => { setPasso('conferir'); }}>Já anotei</button>
            </AcoesJanela>
          </>
        )}
        {janela === 'frase' && passo === 'conferir' && (
          <form className="formulario" onSubmit={(e) => { e.preventDefault(); void salvarNovaFrase(); }}>
            <p>Confira a frase NOVA:</p>
            {posicoesConferir.map((p) => (
              <div key={p} className="campo">
                <label htmlFor={`nova-${String(p)}`}>Palavra {p}</label>
                <input id={`nova-${String(p)}`} type="text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  value={conferencia[p] ?? ''} onChange={(e) => { setConferencia({ ...conferencia, [p]: e.target.value }); }} />
              </div>
            ))}
            {erro && <p className="erro" role="alert">{erro}</p>}
            <AcoesJanela>
              <button type="button" className="botao" onClick={() => { setPasso('nova'); }}>Ver de novo</button>
              <button type="submit" className="botao botao-principal" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Trocar a frase'}</button>
            </AcoesJanela>
          </form>
        )}
      </Janela>

      <Janela aberta={janela === 'apagar'} titulo="Apagar os dados deste celular?" aoFechar={fechar}>
        {janela === 'apagar' && (
          <form className="formulario" onSubmit={(e) => {
            e.preventDefault();
            if (textoApagar.trim().toUpperCase() === 'APAGAR') void sessao.apagarDadosDoAparelho();
          }}>
            <p>
              Apaga o cofre, a digital/PIN e todas as despesas guardadas <strong>neste celular</strong>. Enquanto não houver
              sincronização com o Google (próxima etapa), isso <strong>não tem volta</strong>.
            </p>
            <div className="campo">
              <label htmlFor="confirmar-apagar">Para confirmar, digite APAGAR</label>
              <input id="confirmar-apagar" type="text" autoComplete="off" value={textoApagar} onChange={(e) => { setTextoApagar(e.target.value); }} />
            </div>
            <AcoesJanela>
              <button type="button" className="botao" onClick={fechar}>Cancelar</button>
              <button type="submit" className="botao botao-perigo" disabled={textoApagar.trim().toUpperCase() !== 'APAGAR'}>Apagar</button>
            </AcoesJanela>
          </form>
        )}
      </Janela>
    </section>
  );
}
