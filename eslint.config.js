import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Proibições de segurança: nada de executar texto como código.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // O núcleo de domínio é puro: sem React, sem rede, sem armazenamento do navegador.
    files: ['src/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'idb', '*/interface/*', '*/armazenamento/*'] },
      ],
      'no-restricted-globals': [
        'error',
        'fetch',
        'XMLHttpRequest',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'document',
        'window',
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
);
