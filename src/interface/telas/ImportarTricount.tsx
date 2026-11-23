import { useMemo, useState, type ChangeEvent } from 'react';
import { comMaiuscula, nomeDaCompetencia } from '../../dominio/competencia.ts';
import { formatarReais } from '../../dominio/dinheiro.ts';
import {
  analisarTricount,
  ErroImportacao,
  gerarEventosImportacao,
  planejarImportacao,
  sugerirCategorias,
  type AnaliseTricount,
  type PlanoImportacao,
} from '../../dominio/importacaoTricount.ts';
import { fraseDoSaldo, transferenciaDoSaldo } from '../../dominio/saldo.ts';
import { normalizarTexto } from '../../dominio/sugestoes.ts';
import type { Pessoa } from '../../dominio/tipos.ts';
import { AcoesJanela, Cabecalho, Janela, Segmentos } from '../componentes/Basicos.tsx';
import { hojeISO, mesDeHoje, useAvisar, useFoto, useLoja } from '../contexto.tsx';
import { navegar } from '../rotas.ts';
import { useModo } from '../sessaoContexto.tsx';

/**
 * Importar o histórico do Tricount (especificação 9). O arquivo é lido só neste aparelho; nada é
 * enviado a lugar nenhum além da planilha cifrada de sempre.
 */
export function ImportarTricount() {
  const modo = useModo();
  const { estado } = useFoto();
  const loja = useLoja();
  const avisar = useAvisar();
  const [analise, setAnalise] = useState<AnaliseTricount | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pessoaDe, setPessoaDe] = useState<Record<string, Pessoa>>({});
  const [categoriaDe, setCategoriaDe] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);

  const ativas = estado.categorias.filter((c) => c.ativa);

  const lerArquivo = async (ev: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!arquivo) return;
    try {
      const a = analisarTricount(await arquivo.text());
      setAnalise(a);
      setErro(null);
      setPessoaDe(pessoasSugeridas(a.pessoas, estado.config.nomeA, estado.config.nomeB));
      setCategoriaDe(Object.fromEntries(sugerirCategorias(a.categorias.keys(), estado.categorias)));
    } catch (e) {
      setAnalise(null);
      setErro(e instanceof ErroImportacao ? e.message : 'Não consegui ler este arquivo. Confira se é o CSV exportado do Tricount.');
    }
  };

  const plano = useMemo((): PlanoImportacao | string | null => {
    if (!analise) return null;
    try {
      return planejarImportacao(analise, { pessoaDe, categoriaDe, mesCorrente: mesDeHoje(), hoje: hojeISO() }, estado);
    } catch (e) {
      return e instanceof ErroImportacao ? e.message : 'Algo deu errado ao montar a prévia.';
    }
  }, [analise, pessoaDe, categoriaDe, estado]);

  const importar = (): void => {
    if (!plano || typeof plano === 'string') return;
    const r = loja.executar((e, ctx) => gerarEventosImportacao(plano, e, ctx));
    setConfirmar(false);
    if (!r.ok) {
      setErro(r.erro === 'invalido' ? r.mensagem : 'Não foi possível importar.');
      return;
    }
    avisar('Histórico do Tricount importado');
    navegar({ tela: 'inicio' });
  };

  if (modo !== 'real') {
    return (
      <main className="tela">
        <Cabecalho titulo="Importar do Tricount" comVoltar />
        <section className="secao cartao">
          <p>A importação só funciona no cofre de vocês, não na demonstração — para os dados reais não ficarem num lugar sem criptografia.</p>
        </section>
      </main>
    );
  }

  const quantas = plano && typeof plano !== 'string' ? plano.despesas.length + (plano.ajuste ? 1 : 0) : 0;

  return (
    <main className="tela">
      <Cabecalho titulo="Importar do Tricount" comVoltar />

      <section className="secao cartao">
        <h2>1. Escolha o arquivo</h2>
        <p className="ajuda">
          Use o CSV exportado do Tricount. Ele é lido só neste celular: nada é enviado para fora. Se importar o mesmo
          arquivo de novo, nada é duplicado.
        </p>
        <label className="botao botao-principal">
          {analise ? 'Escolher outro arquivo' : 'Escolher o arquivo'}
          <input type="file" accept=".csv,text/csv,text/plain" className="visualmente-oculto" onChange={(e) => { void lerArquivo(e); }} />
        </label>
        {analise && (
          <p className="ajuda">
            {analise.linhas.filter((l) => l.tipo === 'despesa').length} despesas e{' '}
            {analise.linhas.filter((l) => l.tipo === 'transferencia').length} transferências encontradas
            {analise.ignoradas.length > 0 && ` · ${String(analise.ignoradas.length)} linhas ignoradas (totais e rodapé)`}.
          </p>
        )}
        {erro && <p className="erro" role="alert">{erro}</p>}
      </section>

      {analise && (
        <section className="secao cartao">
          <h2>2. Quem é quem</h2>
          {analise.pessoas.map((nome) => (
            <div className="campo" key={nome}>
              <span className="rotulo">No Tricount: {nome}</span>
              <Segmentos
                rotulo={`Quem é ${nome} no app`}
                opcoes={[
                  { valor: 'A', texto: estado.config.nomeA },
                  { valor: 'B', texto: estado.config.nomeB },
                ]}
                valor={pessoaDe[nome] ?? 'A'}
                aoMudar={(p) => {
                  const outro = analise.pessoas.find((n) => n !== nome);
                  setPessoaDe(outro ? { [nome]: p, [outro]: p === 'A' ? 'B' : 'A' } : { [nome]: p });
                }}
              />
            </div>
          ))}
        </section>
      )}

      {analise && analise.categorias.size > 0 && (
        <section className="secao cartao">
          <h2>3. Categorias</h2>
          <p className="ajuda">Confira para qual categoria do app vai cada categoria do Tricount.</p>
          <div className="formulario">
            {[...analise.categorias.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([nome, n]) => (
                <div className="campo" key={nome}>
                  <label htmlFor={`cat-${nome}`}>
                    {nome} · {n} {n === 1 ? 'despesa' : 'despesas'}
                  </label>
                  <select
                    id={`cat-${nome}`}
                    value={categoriaDe[nome] ?? ''}
                    onChange={(e) => { setCategoriaDe({ ...categoriaDe, [nome]: e.target.value }); }}
                  >
                    {!categoriaDe[nome] && <option value="">Escolha…</option>}
                    {ativas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icone} {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </section>
      )}

      {typeof plano === 'string' && <p className="erro" role="alert">{plano}</p>}

      {plano && typeof plano !== 'string' && (
        <section className="secao cartao">
          <h2>4. Prévia</h2>
          <p className="ajuda">
            Os meses anteriores a {nomeDaCompetencia(mesDeHoje())} entram como <strong>acertados</strong> (já foram resolvidos
            no Tricount). O que ainda está em aberto no Tricount entra como &ldquo;Saldo pendente do Tricount&rdquo; neste mês.
          </p>
          <p className="saldo-frase">No fim do Tricount: {fraseDoSaldo(transferenciaDoSaldo(plano.saldoFinalA), estado.config)}</p>
          {plano.divididas > 0 && (
            <p className="ajuda">{plano.divididas} despesas pagas pelos dois viraram duas cada (uma para quem pagou cada parte).</p>
          )}
          {plano.jaImportadas > 0 && <p className="ajuda">{plano.jaImportadas} despesas já tinham sido importadas e serão puladas.</p>}
          {plano.mesesJaFechados.length > 0 && (
            <p className="erro">
              Atenção: {plano.mesesJaFechados.map((c) => nomeDaCompetencia(c)).join(', ')} já estava acertado no app. As despesas
              importadas nesses meses vão aparecer como &ldquo;chegaram depois do acerto&rdquo;.
            </p>
          )}
          {plano.porMes.length > 0 && (
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Mês</th>
                  <th scope="col">Despesas</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...plano.porMes].reverse().map((m) => (
                  <tr key={m.competencia}>
                    <th scope="row">
                      {comMaiuscula(nomeDaCompetencia(m.competencia))}
                      {m.fechado ? ' 🔒' : ''}
                    </th>
                    <td>{m.quantidade}</td>
                    <td>{formatarReais(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" className="botao botao-principal" disabled={quantas === 0} onClick={() => { setConfirmar(true); }}>
            {quantas === 0 ? 'Nada novo para importar' : `Importar ${String(quantas)} ${quantas === 1 ? 'lançamento' : 'lançamentos'}`}
          </button>
        </section>
      )}

      <Janela aberta={confirmar} titulo="Importar o histórico?" aoFechar={() => { setConfirmar(false); }}>
        {plano && typeof plano !== 'string' && (
          <p>
            Vão entrar {quantas} lançamentos e {plano.mesesFechar.length} meses acertados. Isso vai para o outro celular na
            próxima sincronização.
          </p>
        )}
        <AcoesJanela>
          <button type="button" className="botao" onClick={() => { setConfirmar(false); }}>Cancelar</button>
          <button type="button" className="botao botao-principal" onClick={importar}>Importar</button>
        </AcoesJanela>
      </Janela>
    </main>
  );
}

/** Liga os nomes do Tricount aos do app pelo nome (sem acento/caixa); se não achar, na ordem do arquivo. */
function pessoasSugeridas(pessoas: readonly string[], nomeA: string, nomeB: string): Record<string, Pessoa> {
  const n = (s: string): string => normalizarTexto(s).split(' ')[0] ?? '';
  const [p1 = '', p2 = ''] = pessoas;
  const p1EhB = n(p1) === n(nomeB) || n(p2) === n(nomeA);
  return p1EhB ? { [p1]: 'B', [p2]: 'A' } : { [p1]: 'A', [p2]: 'B' };
}
