import { describe, expect, it } from 'vitest';
import { estaEmbutido } from './protecao.ts';

describe('estaEmbutido', () => {
  it('não acusa quando o app é a janela principal', () => {
    const janela = {};
    expect(estaEmbutido({ top: janela, self: janela })).toBe(false);
  });

  it('acusa quando o app está dentro de outra janela', () => {
    expect(estaEmbutido({ top: {}, self: {} })).toBe(true);
  });

  it('acusa quando o navegador bloqueia a comparação', () => {
    const janela = {
      get top(): unknown {
        throw new Error('bloqueado');
      },
      self: {},
    };
    expect(estaEmbutido(janela)).toBe(true);
  });
});
