import { formatarData } from '../../dominio/competencia.ts';
import {
  categoriaPorId,
  mesFechado,
  nomeDe,
  rotuloDespesa,
  type Despesa,
  type Estado,
} from '../../dominio/estado.ts';
import { navegar } from '../rotas.ts';
import { Reais } from './Basicos.tsx';
import { Icone } from './Icone.tsx';

/** Uma linha de despesa: ícone da categoria, descrição, quem pagou, valor e selos. */
export function ItemDespesa({ despesa: d, estado, mostrarData = false }: { despesa: Despesa; estado: Estado; mostrarData?: boolean }) {
  const categoria = categoriaPorId(estado, d.categoriaId);
  const fechado = mesFechado(estado, d.livro, d.competencia);
  const editadaPorOutro = d.editada && d.alteradoPor !== d.criadoPor;
  const acertadaNoTricount = d.origem.tipo === 'importada' && d.origem.acertada;
  return (
    <li>
      <button type="button" className={acertadaNoTricount ? 'item-despesa item-acertado' : 'item-despesa'} onClick={() => { navegar({ tela: 'editar', id: d.id }); }}>
        <span className="item-icone" style={{ backgroundColor: `${categoria?.cor ?? '#999'}22` }} aria-hidden="true">
          {categoria?.icone ?? '•'}
        </span>
        <span className="item-texto">
          <span className="item-titulo">{rotuloDespesa(d)}</span>
          <span className="item-detalhe">
            {mostrarData && `${formatarData(d.data).slice(0, 5)} · `}
            {categoria?.nome ?? 'Sem categoria'} · pago por {nomeDe(estado.config, d.pagador)}
          </span>
          {(editadaPorOutro || d.origem.tipo === 'recorrente' || acertadaNoTricount) && (
            <span className="item-selos">
              {acertadaNoTricount && <span className="selo">já acertada no Tricount</span>}
              {d.origem.tipo === 'recorrente' && (
                <span className="selo">
                  <Icone nome="repetir" tamanho={12} /> recorrente
                </span>
              )}
              {editadaPorOutro && <span className="selo selo-editado">editado por {nomeDe(estado.config, d.alteradoPor)}</span>}
            </span>
          )}
        </span>
        <span className="item-valor">
          {d.status === 'aguardando' ? <span className="selo selo-alerta">aguardando valor</span> : <Reais centavos={d.valor} />}
          {fechado && (
            <span className="item-cadeado" aria-label="Mês fechado">
              <Icone nome="cadeado" tamanho={14} />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
