import { useState } from 'react';
import { comMaiuscula, formatarData, nomeDoMes } from '../../dominio/competencia.ts';
import { despesasDoMes, mesFechado, type Despesa } from '../../dominio/estado.ts';
import { resumoDoMes } from '../../dominio/fechamento.ts';
import { fraseDoSaldo } from '../../dominio/saldo.ts';
import { LIVRO_CASA, type Pessoa } from '../../dominio/tipos.ts';
import { Cabecalho, Reais, Segmentos, SeletorMes, Vazio } from '../componentes/Basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { ItemDespesa } from '../componentes/ItemDespesa.tsx';
import { useFoto, useMes } from '../contexto.tsx';
import { navegar } from '../rotas.ts';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function tituloDoDia(data: string): string {
  const d = new Date(`${data}T12:00:00`);
  return `${DIAS[d.getDay()] ?? ''}, ${formatarData(data).slice(0, 5)}`;
}

export function Despesas({ categoriaInicial = '' }: { categoriaInicial?: string }) {
  const { estado } = useFoto();
  const { mes, definirMes } = useMes();
  const [categoriaId, setCategoriaId] = useState(categoriaInicial);
  const [pessoa, setPessoa] = useState<'todos' | Pessoa>('todos');

  const todas = despesasDoMes(estado, LIVRO_CASA, mes);
  const filtradas = todas.filter(
    (d) => (categoriaId === '' || d.categoriaId === categoriaId) && (pessoa === 'todos' || d.pagador === pessoa),
  );
  const total = filtradas.reduce((s, d) => s + (d.status === 'normal' ? d.valor : 0), 0);
  const porDia = new Map<string, Despesa[]>();
  for (const d of filtradas) porDia.set(d.data, [...(porDia.get(d.data) ?? []), d]);
  const fechado = mesFechado(estado, LIVRO_CASA, mes);
  const categoriasDoMes = estado.categorias.filter((c) => c.id === categoriaId || todas.some((d) => d.categoriaId === c.id));

  return (
    <main className="tela">
      <Cabecalho titulo="Despesas do mês" />
      <SeletorMes mes={mes} aoMudar={definirMes} />

      {/* Atalho para o acerto do mês, no mesmo formato dos itens do menu "Mais". */}
      <button type="button" className="atalho" onClick={() => { navegar({ tela: 'acertar' }); }}>
        <span className="menu-icone">
          <Icone nome={fechado ? 'cadeado' : 'acerto'} />
        </span>
        <span className="item-texto">
          <span className="item-titulo">{fechado ? `${comMaiuscula(nomeDoMes(mes))} já foi acertado` : 'Acertar contas'}</span>
          <span className="item-detalhe">
            {fechado ? 'Ver o resumo do acerto' : fraseDoSaldo(resumoDoMes(estado, LIVRO_CASA, mes).transferencia, estado.config)}
          </span>
        </span>
        <Icone nome="direita" tamanho={18} />
      </button>

      <div className="filtros">
        <label className="filtro-categoria">
          <span className="visualmente-oculto">Filtrar por categoria</span>
          <select value={categoriaId} onChange={(e) => { setCategoriaId(e.target.value); }}>
            <option value="">Todas as categorias</option>
            {categoriasDoMes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icone} {c.nome}
              </option>
            ))}
          </select>
        </label>
        <Segmentos
          rotulo="Filtrar por quem pagou"
          opcoes={[
            { valor: 'todos', texto: 'Todos' },
            { valor: 'A', texto: estado.config.nomeA },
            { valor: 'B', texto: estado.config.nomeB },
          ]}
          valor={pessoa}
          aoMudar={setPessoa}
        />
      </div>

      <p className="total-filtro">
        {filtradas.length} {filtradas.length === 1 ? 'despesa' : 'despesas'} · <Reais centavos={total} />
      </p>

      {filtradas.length === 0 ? (
        <Vazio>Nada por aqui.</Vazio>
      ) : (
        [...porDia.entries()].map(([data, lista]) => (
          <section key={data} className="grupo-dia">
            <h2>{tituloDoDia(data)}</h2>
            <ul className="lista">
              {lista.map((d) => (
                <ItemDespesa key={d.id} despesa={d} estado={estado} />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
