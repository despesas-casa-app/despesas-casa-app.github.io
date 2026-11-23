import { useMemo, useState } from 'react';
import { gerarDek } from '../../cripto/chaves.ts';
import { gerarFrase, reconhecerPalavra } from '../../cripto/frase.ts';
import { formatarPercentual, lerPercentual } from '../../dominio/percentual.ts';
import type { Pessoa } from '../../dominio/tipos.ts';
import { Cabecalho, Segmentos } from '../componentes/Basicos.tsx';
import { ConfigurarDesbloqueio } from '../seguranca/ConfigurarDesbloqueio.tsx';
import { useSessao } from '../sessaoContexto.tsx';

type Etapa = 'explicar' | 'mostrar' | 'conferir' | 'dados' | 'desbloqueio' | 'salvando';

/** Sorteia 3 posições diferentes (1 a 7) para conferir se a frase foi anotada. */
function sortearPosicoes(): number[] {
  const todas = [1, 2, 3, 4, 5, 6, 7];
  const escolhidas: number[] = [];
  const aleatorios = crypto.getRandomValues(new Uint8Array(3));
  for (const n of aleatorios) {
    const [p] = todas.splice(n % todas.length, 1);
    if (p !== undefined) escolhidas.push(p);
  }
  return escolhidas.sort((a, b) => a - b);
}

/**
 * Criação do cofre neste aparelho (Fase 2; na Fase 3 entra também a planilha do Google):
 * 1. explicar · 2. mostrar a frase · 3. conferir 3 palavras · 4. nomes e divisão ·
 * 5. biometria (ou PIN) · 6. salvar.
 *
 * A frase só existe na memória desta tela. Nada é gravado antes do último passo.
 */
export function CriarCofre({ aoCancelar }: { aoCancelar: () => void }) {
  const sessao = useSessao();
  const [etapa, setEtapa] = useState<Etapa>('explicar');
  const [palavras, setPalavras] = useState<readonly string[]>([]);
  const [posicoes, setPosicoes] = useState<number[]>([]);
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [nomeA, setNomeA] = useState('');
  const [nomeB, setNomeB] = useState('');
  const [euSou, setEuSou] = useState<Pessoa>('A');
  const [minhaParteTexto, setMinhaParteTexto] = useState('50');
  const dekPronta = useMemo(() => gerarDek(), []);

  const gerar = (): void => {
    setPalavras(gerarFrase());
    setPosicoes(sortearPosicoes());
    setRespostas({});
    setEtapa('mostrar');
  };

  const conferir = (): void => {
    const certas = posicoes.every((p) => reconhecerPalavra(respostas[p] ?? '') === palavras[p - 1]);
    if (!certas) {
      setErro('Alguma palavra não confere. Veja a frase de novo e confira o que você anotou.');
      return;
    }
    setErro(null);
    setEtapa('dados');
  };

  const meuNome = euSou === 'A' ? nomeA : nomeB;
  const outroNome = euSou === 'A' ? nomeB : nomeA;
  const minhaParte = lerPercentual(minhaParteTexto);

  const conferirDados = (): void => {
    const problema =
      nomeA.trim() === '' || nomeB.trim() === ''
        ? 'Informe os dois nomes.'
        : nomeA.trim().toLocaleLowerCase('pt-BR') === nomeB.trim().toLocaleLowerCase('pt-BR')
          ? 'Os nomes precisam ser diferentes.'
          : minhaParte === null
            ? 'Percentual inválido. Use de 0 a 100, com até 2 casas.'
            : null;
    setErro(problema);
    if (!problema) setEtapa('desbloqueio');
  };

  const concluir = async (): Promise<void> => {
    if (minhaParte === null) return;
    setEtapa('salvando');
    try {
      const dek = await dekPronta;
      await sessao.cofre.criar(palavras, dek);
      await sessao.concluirCriacao(dek, {
        nomeA,
        nomeB,
        euSou,
        pctProporcional: euSou === 'A' ? minhaParte : 10000 - minhaParte,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o cofre.');
      setEtapa('dados');
    }
  };

  return (
    <main className="tela tela-formulario">
      <Cabecalho titulo="Criar o cofre" />

      {etapa === 'explicar' && (
        <section className="passo">
          <h2>1. A frase-mestra</h2>
          <p>
            Tudo o que vocês lançarem fica <strong>criptografado</strong>. A chave é uma frase de 7
            palavras que o app vai sortear agora.
          </p>
          <ul className="lista-pontos">
            <li>Ela só é pedida para configurar um celular novo ou recuperar os dados.</li>
            <li>No dia a dia, o app abre com a digital.</li>
            <li>
              <strong>Ninguém consegue recuperá-la</strong>: se a frase e todos os celulares forem
              perdidos, os dados se perdem também.
            </li>
          </ul>
          <button type="button" className="botao botao-principal" onClick={gerar}>Sortear a frase</button>
          <button type="button" className="botao botao-texto" onClick={aoCancelar}>Voltar</button>
        </section>
      )}

      {etapa === 'mostrar' && (
        <section className="passo">
          <h2>2. Anote a frase</h2>
          <ol className="frase-mostrada">
            {palavras.map((p, i) => (
              <li key={i}>
                <span>{i + 1}</span> {p}
              </li>
            ))}
          </ol>
          <p className="faixa faixa-alerta">
            Anote no papel ou salve num arquivo do seu computador, fora da pasta do projeto. Não tire
            print e não mande por mensagem.
          </p>
          <button type="button" className="botao botao-principal" onClick={() => { setEtapa('conferir'); }}>Já anotei</button>
          <button type="button" className="botao botao-texto" onClick={gerar}>Sortear outra frase</button>
        </section>
      )}

      {etapa === 'conferir' && (
        <form className="passo formulario" onSubmit={(e) => { e.preventDefault(); conferir(); }}>
          <h2>3. Confira o que você anotou</h2>
          <p>Digite estas palavras da sua frase (as 4 primeiras letras bastam):</p>
          {posicoes.map((p) => (
            <div key={p} className="campo">
              <label htmlFor={`conferir-${String(p)}`}>Palavra {p}</label>
              <input
                id={`conferir-${String(p)}`}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={respostas[p] ?? ''}
                onChange={(e) => { setRespostas({ ...respostas, [p]: e.target.value }); }}
              />
            </div>
          ))}
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="submit" className="botao botao-principal">Conferir</button>
          <button type="button" className="botao botao-texto" onClick={() => { setErro(null); setEtapa('mostrar'); }}>Ver a frase de novo</button>
        </form>
      )}

      {etapa === 'dados' && (
        <form className="passo formulario" onSubmit={(e) => { e.preventDefault(); conferirDados(); }}>
          <h2>4. Quem são vocês</h2>
          <div className="campo-duplo">
            <div className="campo">
              <label htmlFor="cofre-nome-a">Pessoa A</label>
              <input id="cofre-nome-a" type="text" maxLength={30} value={nomeA} onChange={(e) => { setNomeA(e.target.value); }} />
            </div>
            <div className="campo">
              <label htmlFor="cofre-nome-b">Pessoa B</label>
              <input id="cofre-nome-b" type="text" maxLength={30} value={nomeB} onChange={(e) => { setNomeB(e.target.value); }} />
            </div>
          </div>
          <div className="campo">
            <span className="rotulo">Quem está usando este celular?</span>
            <Segmentos
              rotulo="Quem está usando este celular"
              opcoes={[
                { valor: 'A', texto: nomeA.trim() || 'Pessoa A' },
                { valor: 'B', texto: nomeB.trim() || 'Pessoa B' },
              ]}
              valor={euSou}
              aoMudar={setEuSou}
            />
          </div>
          <div className="campo">
            <label htmlFor="cofre-parte">Sua parte nas despesas da casa</label>
            <div className="linha-pct">
              <input id="cofre-parte" type="text" inputMode="decimal" value={minhaParteTexto} onChange={(e) => { setMinhaParteTexto(e.target.value); }} />
              <span className="sufixo">%</span>
              <span className="pct-outro">
                {minhaParte === null ? '' : `${outroNome.trim() || 'a outra pessoa'}: ${formatarPercentual(10000 - minhaParte)}`}
              </span>
            </div>
            <p className="ajuda">
              Vale para Moradia, Despesas da Casa e Contas de Consumo. As outras categorias começam em
              metade cada. Tudo pode ser mudado depois em Categorias.
            </p>
          </div>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="submit" className="botao botao-principal">Continuar</button>
        </form>
      )}

      {etapa === 'desbloqueio' && (
        <section className="passo">
          <h2>5. Como abrir o app neste celular</h2>
          <ConfigurarDesbloqueio
            aoUsarBiometria={async () => { await sessao.cofre.configurarBiometria(await dekPronta, meuNome.trim()); }}
            aoUsarPin={async (pin) => { await sessao.cofre.configurarPin(await dekPronta, pin); }}
            aoConcluir={() => { void concluir(); }}
          />
          {erro && <p className="erro" role="alert">{erro}</p>}
        </section>
      )}

      {etapa === 'salvando' && (
        <section className="passo centro" aria-busy="true">
          <p>Protegendo os dados…</p>
        </section>
      )}
    </main>
  );
}
