import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __VERSAO__: JSON.stringify('teste'),
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/dominio/**', 'src/cripto/**'],
      exclude: ['**/*.test.ts', '**/README.md'],
      // O núcleo de domínio e a criptografia precisam de cobertura alta.
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
});
