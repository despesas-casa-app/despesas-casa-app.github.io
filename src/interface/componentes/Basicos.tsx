import { useEffect, useRef, type ReactNode } from 'react';
import { comMaiuscula, nomeDaCompetencia, somarMeses } from '../../dominio/competencia.ts';
import { formatarReais } from '../../dominio/dinheiro.ts';
import type { Competencia } from '../../dominio/tipos.ts';
import { voltar } from '../rotas.ts';
import { Icone } from './Icone.tsx';

/** Cabeçalho de tela, com botão Voltar opcional. */
export function Cabecalho({ titulo, comVoltar = false, acao }: { titulo: string; comVoltar?: boolean; acao?: ReactNode }) {
  return (
    <header className="cabecalho">
      {comVoltar && (
        <button type="button" className="botao-icone" onClick={voltar} aria-label="Voltar">
          <Icone nome="voltar" />
        </button>
      )}
      <h1>{titulo}</h1>
      {acao && <div className="cabecalho-acao">{acao}</div>}
    </header>
  );
}

/** ‹ novembro de 2026 › */
export function SeletorMes({ mes, aoMudar, maximo }: { mes: Competencia; aoMudar: (c: Competencia) => void; maximo?: Competencia }) {
  const podeAvancar = !maximo || mes < maximo;
  return (
    <div className="seletor-mes">
      <button type="button" className="botao-icone" onClick={() => { aoMudar(somarMeses(mes, -1)); }} aria-label="Mês anterior">
        <Icone nome="esquerda" />
      </button>
      <span className="seletor-mes-nome">{comMaiuscula(nomeDaCompetencia(mes))}</span>
      <button
        type="button"
        className="botao-icone"
        onClick={() => { aoMudar(somarMeses(mes, 1)); }}
        aria-label="Próximo mês"
        disabled={!podeAvancar}
      >
        <Icone nome="direita" />
      </button>
    </div>
  );
}

/** Valor em reais com números alinhados. */
export function Reais({ centavos, className }: { centavos: number; className?: string }) {
  return <span className={`reais ${className ?? ''}`}>{formatarReais(centavos)}</span>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>;
}

/**
 * Janela de confirmação/escolha usando o <dialog> nativo (acessível, fecha com Voltar/Esc).
 */
export function Janela({
  aberta,
  titulo,
  children,
  aoFechar,
}: {
  aberta: boolean;
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);
  return (
    <dialog ref={ref} className="janela" onClose={aoFechar} aria-labelledby="janela-titulo">
      {aberta && (
        <>
          <h2 id="janela-titulo">{titulo}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}

/** Botões lado a lado no rodapé de uma janela. */
export function AcoesJanela({ children }: { children: ReactNode }) {
  return <div className="janela-acoes">{children}</div>;
}

/** Botões de escolha única ("segmentos"). */
export function Segmentos<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
}: {
  opcoes: readonly { valor: T; texto: string }[];
  valor: T;
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div className="segmentos" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          className={o.valor === valor ? 'segmento ativo' : 'segmento'}
          onClick={() => { aoMudar(o.valor); }}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
