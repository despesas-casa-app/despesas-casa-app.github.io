import { describe, expect, it } from 'vitest';
import { ehCentavosValidos, formatarReais } from './dinheiro.ts';

const R = 'R$ ';

describe('formatarReais', () => {
  it('formata zero e valores pequenos', () => {
    expect(formatarReais(0)).toBe(`${R}0,00`);
    expect(formatarReais(5)).toBe(`${R}0,05`);
    expect(formatarReais(99)).toBe(`${R}0,99`);
  });

  it('usa ponto para milhar e vírgula para centavos', () => {
    expect(formatarReais(123456)).toBe(`${R}1.234,56`);
    expect(formatarReais(100000000)).toBe(`${R}1.000.000,00`);
    expect(formatarReais(100000)).toBe(`${R}1.000,00`);
    expect(formatarReais(99999)).toBe(`${R}999,99`);
  });

  it('formata valores negativos', () => {
    expect(formatarReais(-1050)).toBe(`-${R}10,50`);
  });

  it('recusa valores que não são centavos inteiros', () => {
    expect(() => formatarReais(10.5)).toThrow(RangeError);
    expect(() => formatarReais(Number.NaN)).toThrow(RangeError);
    expect(() => formatarReais(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe('ehCentavosValidos', () => {
  it('aceita só inteiros seguros', () => {
    expect(ehCentavosValidos(0)).toBe(true);
    expect(ehCentavosValidos(-1)).toBe(true);
    expect(ehCentavosValidos(0.1 + 0.2)).toBe(false);
    expect(ehCentavosValidos(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
