import { formatarReais } from '../../dominio/dinheiro.ts';

const MAXIMO_DIGITOS = 11; // até R$ 999.999.999,99

/**
 * Campo de valor "estilo app de banco": o teclado numérico abre e os dígitos entram pela
 * direita (digitar 4 5 9 0 → R$ 45,90). Não precisa digitar vírgula.
 */
export function CampoValor({
  id,
  centavos,
  aoMudar,
  autoFocus = false,
  rotulo,
  grande = false,
}: {
  id: string;
  centavos: number;
  aoMudar: (c: number) => void;
  autoFocus?: boolean;
  rotulo: string;
  grande?: boolean;
}) {
  return (
    <div className={grande ? 'campo-valor grande' : 'campo-valor'}>
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="next"
        autoFocus={autoFocus}
        value={formatarReais(centavos)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAXIMO_DIGITOS);
          aoMudar(digitos === '' ? 0 : Number(digitos));
        }}
        onFocus={(e) => {
          const el = e.target;
          requestAnimationFrame(() => { el.setSelectionRange(el.value.length, el.value.length); });
        }}
        onClick={(e) => {
          const el = e.currentTarget;
          el.setSelectionRange(el.value.length, el.value.length);
        }}
      />
    </div>
  );
}
