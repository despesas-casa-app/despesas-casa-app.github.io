import { useEffect, useMemo, useState } from 'react';
import { gerarDek } from '../../cripto/chaves.ts';
import { gerarFrase, reconhecerPalavra } from '../../cripto/frase.ts';
import { ehEmailValido, normalizarEmail } from '../../dominio/config.ts';
import { formatarPercentual, lerPercentual } from '../../dominio/percentual.ts';
import type { Pessoa } from '../../dominio/tipos.ts';
import { Cabecalho, Segmentos } from '../componentes/Basicos.tsx';
import { ConfigurarDesbloqueio } from '../seguranca/ConfigurarDesbloqueio.tsx';
import { useSessao } from '../sessaoContexto.tsx';

type Etapa = 'explicar' | 'google' | 'mostrar' | 'conferir' | 'dados' | 'desbloqueio' | 'salvando';

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
 * Criação do cofre pela 1ª pessoa (recomendado no PC):
 * 1. explicar · 2. entrar com o Google · 3. mostrar a frase · 4. conferir 3 palavras ·
 * 5. nomes, e-mail da outra pessoa e divisão · 6. biometria (ou PIN) ·
 * 7. criar a planilha, compartilhar com a outra pessoa e abrir.
 * Sem o Google configurado, o cofre fica só neste aparelho.
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
  const [meuEmail, setMeuEmail] = useState('');
  const [outroEmail, setOutroEmail] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const dekPronta = useMemo(() => gerarDek(), []);
  const remoto = sessao.remoto;

  // Carrega o login do Google antes: o toque em "Entrar com o Google" precisa abrir a janela na hora.
  useEffect(() => {
    remoto?.preparar().catch(() => undefined);
  }, [remoto]);

  const entrarNoGoogle = (): void => {
    if (!remoto) return;
    setErro(null);
    setOcupado(true);
    remoto
      .entrar()
      .then(() => remoto.emailDaConta())
      .then((email) => {
        setMeuEmail(email);
        gerar();
      })
      .catch((e: unknown) => { setErro(e instanceof Error ? e.message : 'Não foi possível entrar no Google.'); })
      .finally(() => { setOcupado(false); });
  };

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
            : remoto && !ehEmailValido(outroEmail)
              ? `Informe o e-mail Google de ${outroNome.trim() || 'a outra pessoa'}.`
              : remoto && normalizarEmail(outroEmail) === meuEmail
                ? 'O e-mail da outra pessoa precisa ser diferente do seu.'
                : null;
    setErro(problema);
    if (!problema) setEtapa('desbloqueio');
  };

  const concluir = async (): Promise<void> => {
    if (minhaParte === null) return;
    setEtapa('salvando');
    try {
      const dek = await dekPronta;
      const dados = { nomeA, nomeB, euSou, pctProporcional: euSou === 'A' ? minhaParte : 10000 - minhaParte };
      if (!remoto) {
        await sessao.cofre.criar(palavras, dek);
        await sessao.concluirCriacao(dek, dados);
        return;
      }
      // 1) planilha com os parâmetros do cofre; 2) compartilhar; 3) gravar aqui e abrir.
      const outro = normalizarEmail(outroEmail);
      const planilha = await remoto.criarPlanilha();
      const meta = await sessao.cofre.gerarMeta(dek, palavras);
      await planilha.anexarMetaCofre(meta);
      let compartilhou = true;
      try {
        await remoto.compartilhar(planilha.id, outro);
      } catch {
        compartilhou = false;
      }
      await sessao.cofre.salvarMeta(meta);
      const nomeOutro = outroNome.trim();
      sessao.definirAvisoInicial(
        [
          compartilhou
            ? `A planilha foi compartilhada com ${outro}. O Google manda um e-mail para ${nomeOutro} avisando.`
            : `Não consegui compartilhar a planilha com ${outro}. Abra a planilha (Configurações → Abrir a planilha) e compartilhe com esse e-mail, como editor(a).`,
          `No celular de ${nomeOutro}: abrir o app, tocar em "Já temos um cofre: entrar", entrar com a conta Google ${outro}, escolher a planilha "Viver Gasta" e digitar a frase-mestra.`,
          'Dica: passe a frase para a outra pessoa pessoalmente (ou pelo papel), nunca por mensagem.',
        ].join('\n'),
      );
      await sessao.concluirCriacao(
        dek,
        euSou === 'A' ? { ...dados, emailA: meuEmail, emailB: outro } : { ...dados, emailA: outro, emailB: meuEmail },
        planilha.id,
      );
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
          <button type="button" className="botao botao-principal" onClick={() => { if (remoto) setEtapa('google'); else gerar(); }}>
            {remoto ? 'Começar' : 'Sortear a frase'}
          </button>
          <button type="button" className="botao botao-texto" onClick={aoCancelar}>Voltar</button>
        </section>
      )}

      {etapa === 'google' && (
        <section className="passo">
          <h2>2. Entre com a sua conta Google</h2>
          <p>
            O app vai criar uma planilha no seu Google Drive, onde ficam as despesas{' '}
            <strong>criptografadas</strong>. É por ela que os dois celulares conversam.
          </p>
          <p className="ajuda">
            O app só enxerga essa planilha: o resto do seu Drive continua invisível para ele. Se aparecer
            "O Google não verificou este app", confira que o nome é Viver Gasta e toque em Continuar.
          </p>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="button" className="botao botao-principal" disabled={ocupado} onClick={entrarNoGoogle}>
            {ocupado ? 'Aguardando o Google…' : 'Entrar com o Google'}
          </button>
          <button type="button" className="botao botao-texto" onClick={aoCancelar}>Voltar</button>
        </section>
      )}

      {etapa === 'mostrar' && (
        <section className="passo">
          <h2>{remoto ? '3' : '2'}. Anote a frase</h2>
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
          <h2>{remoto ? '4' : '3'}. Confira o que você anotou</h2>
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
          <h2>{remoto ? '5' : '4'}. Quem são vocês</h2>
          {meuEmail && <p className="ajuda">Sua conta Google: <strong>{meuEmail}</strong></p>}
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
          {remoto && (
            <div className="campo">
              <label htmlFor="cofre-email-outro">E-mail Google de {outroNome.trim() || 'a outra pessoa'}</label>
              <input
                id="cofre-email-outro"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                value={outroEmail}
                onChange={(e) => { setOutroEmail(e.target.value); }}
              />
              <p className="ajuda">A planilha será compartilhada com esse e-mail. Só essas duas contas conseguem entrar.</p>
            </div>
          )}
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
          <h2>{remoto ? '6' : '5'}. Como abrir o app neste celular</h2>
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
          <p>{remoto ? 'Criando a planilha e protegendo os dados…' : 'Protegendo os dados…'}</p>
        </section>
      )}
    </main>
  );
}
