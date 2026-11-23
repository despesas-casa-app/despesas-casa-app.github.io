/** As duas pessoas do casal. Os nomes reais ficam na configuração (criptografada). */
export type Pessoa = 'A' | 'B';

/** Data no formato AAAA-MM-DD (sem fuso horário). */
export type DataISO = string;

/** Mês de competência no formato AAAA-MM. */
export type Competencia = string;

/** Percentual em centésimos de ponto: 10000 = 100%, 5835 = 58,35%. Sempre inteiro. */
export type PontosBase = number;

/** Na v1 existe um único livro. Na v2, cada projeto será um livro novo. */
export const LIVRO_CASA = 'casa';

export const PESSOAS: readonly Pessoa[] = ['A', 'B'];

export function outraPessoa(p: Pessoa): Pessoa {
  return p === 'A' ? 'B' : 'A';
}

export function ehPessoa(valor: unknown): valor is Pessoa {
  return valor === 'A' || valor === 'B';
}
