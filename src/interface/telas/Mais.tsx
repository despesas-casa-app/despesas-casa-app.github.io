import { Cabecalho } from '../componentes/Basicos.tsx';
import { Icone, type NomeIcone } from '../componentes/Icone.tsx';
import { navegar, type Rota } from '../rotas.ts';

const ITENS: readonly { rota: Rota; icone: NomeIcone; titulo: string; detalhe: string }[] = [
  { rota: { tela: 'acertar' }, icone: 'acerto', titulo: 'Acertar contas', detalhe: 'Resumo do mês e fechamento' },
  { rota: { tela: 'recorrentes' }, icone: 'repetir', titulo: 'Recorrentes e parcelas', detalhe: 'Pausar, encerrar, mudar valores' },
  { rota: { tela: 'categorias' }, icone: 'tag', titulo: 'Categorias', detalhe: 'Divisão padrão, ordem, arquivar' },
  { rota: { tela: 'atividade' }, icone: 'atividade', titulo: 'Atividade', detalhe: 'Tudo o que cada um fez' },
  { rota: { tela: 'configuracoes' }, icone: 'engrenagem', titulo: 'Configurações', detalhe: 'Nomes, aparelho, segurança' },
];

export function Mais() {
  return (
    <main className="tela">
      <Cabecalho titulo="Mais" />
      <ul className="menu">
        {ITENS.map((i) => (
          <li key={i.titulo}>
            <button type="button" onClick={() => { navegar(i.rota); }}>
              <span className="menu-icone"><Icone nome={i.icone} /></span>
              <span className="item-texto">
                <span className="item-titulo">{i.titulo}</span>
                <span className="item-detalhe">{i.detalhe}</span>
              </span>
              <Icone nome="direita" tamanho={18} />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
