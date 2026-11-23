import { useMemo, useState } from 'react';
import { gerarAtividade, type ItemAtividade } from '../../dominio/atividade.ts';
import { dataLocal, formatarData } from '../../dominio/competencia.ts';
import { Cabecalho, Vazio } from '../componentes/Basicos.tsx';
import { useFoto } from '../contexto.tsx';
import { navegar } from '../rotas.ts';

const POR_PAGINA = 60;

function tituloDoDia(dia: string): string {
  const hoje = dataLocal(new Date());
  const ontem = dataLocal(new Date(Date.now() - 86_400_000));
  if (dia === hoje) return 'Hoje';
  if (dia === ontem) return 'Ontem';
  return formatarData(dia);
}

/** Histórico geral, agrupado por dia (tela 8). */
export function Atividade() {
  const { estado } = useFoto();
  const [limite, setLimite] = useState(POR_PAGINA);
  const itens = useMemo(() => gerarAtividade(estado.projecao.eventos, estado.config), [estado]);
  const visiveis = itens.slice(0, limite);

  const porDia = new Map<string, ItemAtividade[]>();
  for (const item of visiveis) {
    const dia = dataLocal(new Date(item.instante));
    porDia.set(dia, [...(porDia.get(dia) ?? []), item]);
  }

  return (
    <main className="tela">
      <Cabecalho titulo="Atividade" comVoltar />
      {itens.length === 0 && <Vazio>Nada ainda.</Vazio>}
      {[...porDia.entries()].map(([dia, lista]) => (
        <section key={dia} className="grupo-dia">
          <h2>{tituloDoDia(dia)}</h2>
          <ul className="feed">
            {lista.map((item) => (
              <li key={item.eventoId}>
                <time>{new Date(item.instante).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
                <div>
                  {item.textos.map((t) =>
                    item.entidade === 'despesa' ? (
                      <button key={t} type="button" className="link-texto" onClick={() => { navegar({ tela: 'editar', id: item.entidadeId }); }}>
                        {t}
                      </button>
                    ) : (
                      <p key={t}>{t}</p>
                    ),
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {itens.length > limite && (
        <button type="button" className="botao" onClick={() => { setLimite(limite + POR_PAGINA); }}>
          Ver mais
        </button>
      )}
    </main>
  );
}
