import { describe, expect, it } from 'vitest';
import {
  comMaiuscula,
  competencia,
  competenciaDaData,
  dataLocal,
  dataNoMes,
  diaDaData,
  diasNoMes,
  ehCompetencia,
  ehDataValida,
  formatarData,
  mesesEntre,
  nomeCurtoDaCompetencia,
  nomeDaCompetencia,
  nomeDoMes,
  partesCompetencia,
  somarMeses,
} from './competencia.ts';
import { lerReais, somar } from './dinheiro.ts';
import { dividir, VALOR_MAXIMO } from './divisao.ts';
import { avancar, ehHlcValido, formatarHlc, instanteDoHlc, lerHlc, receber } from './hlc.ts';
import { complemento, ehPercentualValido, formatarPercentual, lerPercentual } from './percentual.ts';
import { ehPessoa, outraPessoa } from './tipos.ts';

describe('dinheiro: lerReais e somar', () => {
  it('lê o padrão brasileiro', () => {
    expect(lerReais('1.234,56')).toBe(123456);
    expect(lerReais('1234,5')).toBe(123450);
    expect(lerReais('R$ 12')).toBe(1200);
    expect(lerReais('R$ 1.000.000,00')).toBe(100000000);
    expect(lerReais('-3,00')).toBe(-300);
    expect(lerReais('0,01')).toBe(1);
  });

  it('recusa formatos inválidos', () => {
    for (const t of ['', 'abc', '1,234', '12.34', '1.23,00', '1,2,3', '--1']) expect(lerReais(t)).toBeNull();
    expect(lerReais('9'.repeat(20))).toBeNull();
  });

  it('soma inteiros e recusa estouro', () => {
    expect(somar([1, 2, 3])).toBe(6);
    expect(somar([])).toBe(0);
    expect(() => somar([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe('percentual', () => {
  it('formata', () => {
    expect(formatarPercentual(5835)).toBe('58,35%');
    expect(formatarPercentual(6000)).toBe('60%');
    expect(formatarPercentual(5830)).toBe('58,3%');
    expect(formatarPercentual(5)).toBe('0,05%');
    expect(formatarPercentual(10000)).toBe('100%');
    expect(() => formatarPercentual(10001)).toThrow(RangeError);
  });

  it('lê com vírgula, ponto ou %', () => {
    expect(lerPercentual('58,35')).toBe(5835);
    expect(lerPercentual('58.3')).toBe(5830);
    expect(lerPercentual(' 60 % ')).toBe(6000);
    expect(lerPercentual('100')).toBe(10000);
    expect(lerPercentual('0')).toBe(0);
  });

  it('recusa inválidos e mais de 2 casas', () => {
    for (const t of ['', 'x', '58,355', '101', '-1', '1000']) expect(lerPercentual(t)).toBeNull();
  });

  it('valida e calcula o complemento', () => {
    expect(ehPercentualValido(0)).toBe(true);
    expect(ehPercentualValido(10000)).toBe(true);
    expect(ehPercentualValido(50.5)).toBe(false);
    expect(ehPercentualValido('50')).toBe(false);
    expect(complemento(5835)).toBe(4165);
  });
});

describe('divisão', () => {
  it('0% e 100%', () => {
    expect(dividir(1000, 0, 'A')).toEqual({ A: 0, B: 1000 });
    expect(dividir(1000, 10000, 'B')).toEqual({ A: 1000, B: 0 });
  });

  it('percentual com casas decimais', () => {
    // 58,35% de R$ 100,00 pago por B: cota de A = 58,35 exatos.
    expect(dividir(10000, 5835, 'B')).toEqual({ A: 5835, B: 4165 });
    // R$ 0,99 a 58,35% pago por B: A = floor(57,7665) = 57; B absorve.
    expect(dividir(99, 5835, 'B')).toEqual({ A: 57, B: 42 });
  });

  it('valores negativos (estorno) mantêm a regra', () => {
    const c = dividir(-1001, 5000, 'A');
    expect(c).toEqual({ A: -501, B: -500 });
  });

  it('recusa entradas inválidas', () => {
    expect(() => dividir(1.5, 5000, 'A')).toThrow(RangeError);
    expect(() => dividir(VALOR_MAXIMO + 1, 5000, 'A')).toThrow(RangeError);
    expect(() => dividir(100, 10001, 'A')).toThrow(RangeError);
  });

  it('valor máximo continua exato', () => {
    const c = dividir(VALOR_MAXIMO, 3333, 'A');
    expect(c.A + c.B).toBe(VALOR_MAXIMO);
  });
});

describe('competência e datas', () => {
  it('valida', () => {
    expect(ehCompetencia('2026-11')).toBe(true);
    expect(ehCompetencia('2026-13')).toBe(false);
    expect(ehCompetencia(202611)).toBe(false);
    expect(ehDataValida('2026-02-29')).toBe(false);
    expect(ehDataValida('2028-02-29')).toBe(true);
    expect(ehDataValida('2026-11-31')).toBe(false);
    expect(ehDataValida('2026-00-10')).toBe(false);
    expect(ehDataValida('2026-11-00')).toBe(false);
    expect(ehDataValida('26-11-01')).toBe(false);
    expect(ehDataValida(null)).toBe(false);
  });

  it('converte e soma meses', () => {
    expect(competencia(2026, 1)).toBe('2026-01');
    expect(partesCompetencia('2026-11')).toEqual({ ano: 2026, mes: 11 });
    expect(() => partesCompetencia('x')).toThrow(RangeError);
    expect(competenciaDaData('2026-11-22')).toBe('2026-11');
    expect(() => competenciaDaData('2026-11-40')).toThrow(RangeError);
    expect(somarMeses('2026-11', 2)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(somarMeses('2026-05', -17)).toBe('2024-12');
    expect(mesesEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(mesesEntre('2026-11', '2026-10')).toEqual([]);
  });

  it('dia 31 vira o último dia do mês', () => {
    expect(diasNoMes('2026-02')).toBe(28);
    expect(dataNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(dataNoMes('2026-04', 31)).toBe('2026-04-30');
    expect(dataNoMes('2026-05', 31)).toBe('2026-05-31');
    expect(dataNoMes('2026-05', 0)).toBe('2026-05-01');
    expect(diaDaData('2026-05-09')).toBe(9);
  });

  it('formata para o usuário', () => {
    expect(formatarData('2026-11-22')).toBe('22/11/2026');
    expect(nomeDaCompetencia('2026-03')).toBe('março de 2026');
    expect(nomeDoMes('2026-12')).toBe('dezembro');
    expect(nomeCurtoDaCompetencia('2026-11')).toBe('nov/26');
    expect(dataLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(comMaiuscula('outubro de 2026')).toBe('Outubro de 2026');
    expect(comMaiuscula('')).toBe('');
  });
});

describe('HLC', () => {
  it('avança com o relógio e usa o contador quando o relógio não anda', () => {
    const a = avancar(null, 1000, 'cel1');
    expect(a).toEqual({ ms: 1000, contador: 0, aparelho: 'cel1' });
    const b = avancar(a, 1000, 'cel1');
    expect(b.contador).toBe(1);
    const c = avancar(b, 500, 'cel1'); // relógio voltou: não anda para trás
    expect(c).toEqual({ ms: 1000, contador: 2, aparelho: 'cel1' });
    expect(avancar(c, 2000, 'cel1')).toEqual({ ms: 2000, contador: 0, aparelho: 'cel1' });
    expect(formatarHlc(b) < formatarHlc(c)).toBe(true);
  });

  it('ao receber, fica depois do evento remoto', () => {
    const local = { ms: 1000, contador: 3, aparelho: 'a' };
    expect(receber(local, { ms: 5000, contador: 2, aparelho: 'b' }, 100, 'a')).toEqual({ ms: 5000, contador: 3, aparelho: 'a' });
    expect(receber(local, { ms: 1000, contador: 7, aparelho: 'b' }, 100, 'a')).toEqual({ ms: 1000, contador: 8, aparelho: 'a' });
    expect(receber(local, { ms: 10, contador: 7, aparelho: 'b' }, 100, 'a')).toEqual({ ms: 1000, contador: 4, aparelho: 'a' });
    expect(receber(local, { ms: 10, contador: 0, aparelho: 'b' }, 9000, 'a')).toEqual({ ms: 9000, contador: 0, aparelho: 'a' });
    expect(receber(null, { ms: 10, contador: 0, aparelho: 'b' }, 5, 'a')).toEqual({ ms: 10, contador: 1, aparelho: 'a' });
  });

  it('formata, lê e valida', () => {
    const h = { ms: 1795392968042, contador: 12, aparelho: 'cel-A_1' };
    const t = formatarHlc(h);
    expect(t).toBe('001795392968042:00012:cel-A_1');
    expect(lerHlc(t)).toEqual(h);
    expect(instanteDoHlc(t)).toBe(1795392968042);
    expect(ehHlcValido(t)).toBe(true);
    expect(ehHlcValido('x')).toBe(false);
    expect(() => lerHlc('1:2:3')).toThrow(RangeError);
    expect(() => avancar(null, 1, 'com:dois-pontos')).toThrow(RangeError);
    expect(() => avancar({ ms: 5, contador: 99999, aparelho: 'a' }, 5, 'a')).toThrow(RangeError);
  });
});

describe('pessoas', () => {
  it('outra pessoa e validação', () => {
    expect(outraPessoa('A')).toBe('B');
    expect(outraPessoa('B')).toBe('A');
    expect(ehPessoa('A')).toBe(true);
    expect(ehPessoa('C')).toBe(false);
  });
});
