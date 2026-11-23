import { validarFrase } from '../../cripto/frase.ts';

/**
 * Campo para digitar a frase-mestra. Sem corretor, sem sugestões do teclado e sem salvar no
 * histórico do navegador. Mostra na hora se alguma palavra não está na lista.
 */
export function CampoFrase({ valor, aoMudar, id = 'campo-frase' }: { valor: string; aoMudar: (v: string) => void; id?: string }) {
  const v = validarFrase(valor);
  const aviso =
    valor.trim() === ''
      ? 'Digite as 7 palavras, separadas por espaço. Basta digitar as 4 primeiras letras de cada uma.'
      : v.ok
        ? '✓ As 7 palavras foram reconhecidas.'
        : v.erro === 'quantidade'
          ? `${String(v.encontradas)} de 7 palavras.`
          : `A palavra ${String(v.posicao)} ("${v.digitada}") não está na lista.`;
  return (
    <div className="campo">
      <label htmlFor={id}>Frase-mestra</label>
      <textarea
        id={id}
        className="campo-frase"
        rows={3}
        value={valor}
        onChange={(e) => { aoMudar(e.target.value); }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-describedby={`${id}-ajuda`}
      />
      <p id={`${id}-ajuda`} className={v.ok ? 'ajuda ok' : 'ajuda'}>
        {aviso}
      </p>
    </div>
  );
}
