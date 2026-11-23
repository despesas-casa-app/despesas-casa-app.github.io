import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Endereço-base do site. No GitHub Actions ele é calculado a partir do nome do repositório
 * (ver .github/workflows/publicar.yml). No PC, fica "/".
 */
const base = process.env['BASE_PATH'] ?? '/';

/** Versão exibida no app: o início do commit publicado, ou "local" no PC. */
const versao = (process.env['GITHUB_SHA'] ?? 'local').slice(0, 7);

/**
 * Content Security Policy: lista do que o navegador pode carregar e com quem o app pode falar.
 * O GitHub Pages não permite configurar cabeçalhos HTTP, por isso ela vai numa tag <meta>.
 * Limitação conhecida: "frame-ancestors" não funciona via <meta>; a proteção contra o app ser
 * embutido em outro site é feita em src/interface/protecao.ts.
 *
 * Fase 3 vai acrescentar os domínios do Google (login, Picker e APIs) — e só eles.
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Coloca a CSP só no site publicado (o modo de desenvolvimento usa scripts embutidos). */
function cspNoBuild(): Plugin {
  return {
    name: 'csp-no-build',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

export default defineConfig({
  base,
  define: {
    __VERSAO__: JSON.stringify(versao),
  },
  build: {
    sourcemap: false,
    // Nada de arquivos embutidos como "data:" no JS: tudo vem do próprio site.
    assetsInlineLimit: 0,
  },
  plugins: [
    react(),
    cspNoBuild(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registro do service worker num arquivo próprio (compatível com a CSP, sem script embutido).
      injectRegister: 'script',
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Viver Gasta',
        short_name: 'Viver Gasta',
        description: 'Despesas compartilhadas da casa, com acerto mensal.',
        lang: 'pt-BR',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff6dc',
        theme_color: '#f5bf0f',
        icons: [
          { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icones/icone-mascara-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
