import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

/**
 * Navegação simples pelo "#" do endereço (o botão Voltar do Android funciona).
 * Ex.: #/despesa/nova, #/despesa/abc123, #/categorias.
 */
export type Rota =
  | { readonly tela: 'inicio' }
  | { readonly tela: 'despesas' }
  | { readonly tela: 'nova'; readonly modo: 'unica' | 'parcelado' | 'recorrente' }
  | { readonly tela: 'editar'; readonly id: string }
  | { readonly tela: 'relatorios' }
  | { readonly tela: 'acertar' }
  | { readonly tela: 'mais' }
  | { readonly tela: 'categorias' }
  | { readonly tela: 'recorrentes' }
  | { readonly tela: 'atividade' }
  | { readonly tela: 'configuracoes' };

export function lerRota(hash: string): Rota {
  const [caminho = '', consulta = ''] = hash.replace(/^#\/?/, '').split('?');
  const partes = caminho.split('/').filter(Boolean);
  const params = new URLSearchParams(consulta);
  switch (partes[0]) {
    case 'despesas':
      return { tela: 'despesas' };
    case 'despesa': {
      const id = partes[1];
      if (!id || id === 'nova') {
        const modo = params.get('modo');
        return { tela: 'nova', modo: modo === 'parcelado' || modo === 'recorrente' ? modo : 'unica' };
      }
      return { tela: 'editar', id: decodeURIComponent(id) };
    }
    case 'relatorios':
    case 'acertar':
    case 'mais':
    case 'categorias':
    case 'recorrentes':
    case 'atividade':
    case 'configuracoes':
      return { tela: partes[0] };
    default:
      return { tela: 'inicio' };
  }
}

export function hashDaRota(r: Rota): string {
  switch (r.tela) {
    case 'inicio':
      return '#/';
    case 'nova':
      return r.modo === 'unica' ? '#/despesa/nova' : `#/despesa/nova?modo=${r.modo}`;
    case 'editar':
      return `#/despesa/${encodeURIComponent(r.id)}`;
    default:
      return `#/${r.tela}`;
  }
}

let rotaAtual: Rota = lerRota(window.location.hash);
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const o of ouvintes) o();
}

window.addEventListener('hashchange', () => {
  rotaAtual = lerRota(window.location.hash);
  avisar();
  window.scrollTo(0, 0);
});

/**
 * Vai para outra tela. A troca acontece na hora (flushSync) para que o foco no campo de valor
 * aconteça ainda dentro do toque do usuário — assim o teclado numérico do celular já abre.
 */
export function navegar(r: Rota): void {
  const hash = hashDaRota(r);
  if (window.location.hash === hash) return;
  flushSync(() => {
    rotaAtual = r;
    avisar();
  });
  window.location.hash = hash;
  window.scrollTo(0, 0);
}

/** Volta para a tela anterior (ou para o início, se não houver). */
export function voltar(): void {
  if (window.history.length > 1) window.history.back();
  else navegar({ tela: 'inicio' });
}

export function useRota(): Rota {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => rotaAtual,
  );
}
