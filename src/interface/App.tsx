import { useState } from 'react';
import { nomeDaCompetencia } from '../dominio/competencia.ts';
import { moverParaMesAberto, proximoMesAberto } from '../dominio/despesas.ts';
import { nomeDe, rotuloDespesa } from '../dominio/estado.ts';
import { divergenciasDeFechamento, reabrirMes } from '../dominio/fechamento.ts';
import { formatarReais } from '../dominio/dinheiro.ts';
import { LIVRO_CASA } from '../dominio/tipos.ts';
import { Janela } from './componentes/Basicos.tsx';
import { Icone, type NomeIcone } from './componentes/Icone.tsx';
import { FaixaSincronizacao } from './componentes/IndicadorSync.tsx';
import { useAvisar, useFoto, useLoja } from './contexto.tsx';
import { navegar, useRota, type Rota } from './rotas.ts';
import { useModo, useSessao } from './sessaoContexto.tsx';
import { Acertar } from './telas/Acertar.tsx';
import { Atividade } from './telas/Atividade.tsx';
import { Categorias } from './telas/Categorias.tsx';
import { Configuracoes } from './telas/Configuracoes.tsx';
import { Despesas } from './telas/Despesas.tsx';
import { EditarDespesa } from './telas/EditarDespesa.tsx';
import { ImportarTricount } from './telas/ImportarTricount.tsx';
import { Inicio } from './telas/Inicio.tsx';
import { Mais } from './telas/Mais.tsx';
import { EditarParcelamento, EditarRecorrente } from './telas/EditarModelos.tsx';
import { Recorrentes } from './telas/Recorrentes.tsx';
import { Relatorios } from './telas/Relatorios.tsx';

function Tela({ rota }: { rota: Rota }) {
  switch (rota.tela) {
    case 'inicio':
      return <Inicio />;
    case 'despesas':
      return <Despesas key={rota.categoriaId ?? ''} categoriaInicial={rota.categoriaId ?? ''} />;
    case 'nova':
      return <EditarDespesa key={`nova-${rota.modo}`} modoInicial={rota.modo} />;
    case 'editar':
      return <EditarDespesa key={rota.id} id={rota.id} />;
    case 'relatorios':
      return <Relatorios />;
    case 'acertar':
      return <Acertar />;
    case 'mais':
      return <Mais />;
    case 'categorias':
      return <Categorias />;
    case 'recorrentes':
      return <Recorrentes />;
    case 'editar-recorrente':
      return <EditarRecorrente key={rota.id} id={rota.id} />;
    case 'editar-parcelamento':
      return <EditarParcelamento key={rota.id} id={rota.id} />;
    case 'atividade':
      return <Atividade />;
    case 'configuracoes':
      return <Configuracoes />;
    case 'importar-tricount':
      return <ImportarTricount />;
  }
}

const ABAS: readonly { tela: Rota['tela']; rota: Rota; icone: NomeIcone; texto: string; grupo: readonly Rota['tela'][] }[] = [
  { tela: 'inicio', rota: { tela: 'inicio' }, icone: 'inicio', texto: 'Início', grupo: ['inicio'] },
  { tela: 'despesas', rota: { tela: 'despesas' }, icone: 'lista', texto: 'Despesas', grupo: ['despesas', 'editar'] },
  { tela: 'relatorios', rota: { tela: 'relatorios' }, icone: 'grafico', texto: 'Relatórios', grupo: ['relatorios'] },
  {
    tela: 'mais',
    rota: { tela: 'mais' },
    icone: 'menu',
    texto: 'Mais',
    grupo: ['mais', 'acertar', 'categorias', 'recorrentes', 'editar-recorrente', 'editar-parcelamento', 'atividade', 'configuracoes', 'importar-tricount'],
  },
];

/** Telas com botão "Salvar" fixo no rodapé: escondem a barra de navegação. */
const TELAS_DE_FORMULARIO: readonly Rota['tela'][] = ['nova', 'editar', 'editar-recorrente', 'editar-parcelamento'];

function BarraNavegacao({ rota }: { rota: Rota }) {
  const abrirNova = (): void => {
    navegar({ tela: 'nova', modo: 'unica' });
    // Foco ainda dentro do toque: faz o teclado numérico abrir no celular.
    document.getElementById('campo-valor')?.focus();
  };
  const [primeira, segunda, terceira, quarta] = ABAS;
  const aba = (a: (typeof ABAS)[number] | undefined) =>
    a && (
      <a
        key={a.tela}
        href={a.tela === 'inicio' ? '#/' : `#/${a.tela}`}
        className={a.grupo.includes(rota.tela) ? 'aba ativa' : 'aba'}
        aria-current={a.grupo.includes(rota.tela) ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault();
          navegar(a.rota);
        }}
      >
        <Icone nome={a.icone} />
        <span>{a.texto}</span>
      </a>
    );
  return (
    <nav className="barra-navegacao" aria-label="Navegação principal">
      {aba(primeira)}
      {aba(segunda)}
      <button type="button" className="botao-nova" onClick={abrirNova} aria-label="Nova despesa">
        <Icone nome="mais" tamanho={28} />
      </button>
      {aba(terceira)}
      {aba(quarta)}
    </nav>
  );
}

/**
 * Janela "Esse mês já está fechado. O que você deseja fazer?" para despesas que chegaram pela
 * sincronização depois do acerto (especificação 4.4).
 */
function AvisoMesFechado() {
  const loja = useLoja();
  const { estado } = useFoto();
  const avisar = useAvisar();
  const [dispensados, setDispensados] = useState<readonly string[]>([]);
  const divergencia = divergenciasDeFechamento(estado, LIVRO_CASA).find(
    (d) => !dispensados.includes(`${d.fechamento.competencia}:${d.chegaramDepois.map((x) => x.id).join(',')}:${String(d.contaMudou)}`),
  );
  if (!divergencia) return null;
  const chave = `${divergencia.fechamento.competencia}:${divergencia.chegaramDepois.map((x) => x.id).join(',')}:${String(divergencia.contaMudou)}`;
  const c = divergencia.fechamento.competencia;
  const destino = proximoMesAberto(estado, LIVRO_CASA, c);
  const dispensar = (): void => { setDispensados((l) => [...l, chave]); };

  return (
    <Janela aberta titulo="Esse mês já está fechado. O que você deseja fazer?" aoFechar={dispensar}>
      <p>
        {divergencia.chegaramDepois.length > 0
          ? `Chegaram despesas de ${nomeDaCompetencia(c)} depois do acerto:`
          : `Uma despesa de ${nomeDaCompetencia(c)} foi alterada depois do acerto.`}
      </p>
      {divergencia.chegaramDepois.length > 0 && (
        <ul className="lista-simples">
          {divergencia.chegaramDepois.map((d) => (
            <li key={d.id}>
              {rotuloDespesa(d)} · {formatarReais(d.valor)} · {nomeDe(estado.config, d.criadoPor)}
            </li>
          ))}
        </ul>
      )}
      <div className="janela-acoes vertical">
        {divergencia.chegaramDepois.length > 0 && (
          <button type="button" className="botao botao-principal" onClick={() => {
            for (const d of divergencia.chegaramDepois) loja.executar((e, ctx) => moverParaMesAberto(e, d.id, ctx));
            avisar(`Movido para ${nomeDaCompetencia(destino)}`);
          }}>
            Mover para o mês em aberto ({nomeDaCompetencia(destino)})
          </button>
        )}
        <button type="button" className="botao" onClick={() => {
          loja.executar((e, ctx) => reabrirMes(e, LIVRO_CASA, c, ctx));
          avisar(`${nomeDaCompetencia(c)} reaberto`);
        }}>
          Reabrir o mês
        </button>
        <button type="button" className="botao botao-texto" onClick={dispensar}>
          Agora não
        </button>
      </div>
    </Janela>
  );
}

/** Mensagem única depois de criar o cofre (ex.: o que a outra pessoa precisa fazer). */
function AvisoInicial() {
  const sessao = useSessao();
  const [texto, setTexto] = useState(() => sessao.tomarAvisoInicial());
  if (!texto) return null;
  return (
    <Janela aberta titulo="Cofre criado!" aoFechar={() => { setTexto(null); }}>
      {texto.split('\n').map((p) => (
        <p key={p}>{p}</p>
      ))}
      <div className="janela-acoes">
        <button type="button" className="botao botao-principal" onClick={() => { setTexto(null); }}>
          Entendi
        </button>
      </div>
    </Janela>
  );
}

export function App() {
  const rota = useRota();
  const { carregado } = useFoto();
  const modo = useModo();
  if (!carregado) {
    return (
      <main className="tela carregando" aria-busy="true">
        <img src={`${import.meta.env.BASE_URL}icone.svg`} alt="" width="64" height="64" />
      </main>
    );
  }
  return (
    <>
      {modo === 'demo' && (
        <div className="faixa-demo" role="note">
          <Icone nome="alerta" tamanho={14} /> Modo demonstração · dados fictícios, só neste aparelho
        </div>
      )}
      <FaixaSincronizacao />
      <Tela rota={rota} />
      {!TELAS_DE_FORMULARIO.includes(rota.tela) && <BarraNavegacao rota={rota} />}
      <AvisoMesFechado />
      <AvisoInicial />
    </>
  );
}
