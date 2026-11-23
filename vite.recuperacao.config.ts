import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

/**
 * Build da página de recuperação (especificação 10) como UM arquivo HTML autossuficiente:
 * todo o JavaScript e o CSS vão dentro dele, para a página continuar funcionando mesmo salva no
 * computador, sem o site. A CSP proíbe qualquer conexão (connect-src 'none'): os arquivos e a frase
 * nunca saem do aparelho.
 *
 * Roda ANTES do build principal (ver package.json) e limpa a pasta dist.
 */
function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sha256(texto: string): string {
  return `'sha256-${createHash('sha256').update(texto, 'utf8').digest('base64')}'`;
}

function tudoNumArquivo(): Plugin {
  return {
    name: 'tudo-num-arquivo',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((a) => a.type === 'asset' && a.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') throw new Error('HTML da recuperação não encontrado');
      let fonte = String(html.source);
      const scripts: string[] = [];
      const estilos: string[] = [];
      for (const [nome, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          const codigo = item.code.replaceAll('</script', '<\\/script');
          scripts.push(codigo);
          fonte = fonte.replace(
            new RegExp(`<script[^>]*src="[^"]*${escaparRegex(item.fileName)}"[^>]*></script>`),
            () => `<script type="module">${codigo}</script>`,
          );
          Reflect.deleteProperty(bundle, nome);
        } else if (item.fileName.endsWith('.css')) {
          const css = String(item.source);
          estilos.push(css);
          fonte = fonte.replace(new RegExp(`<link[^>]*href="[^"]*${escaparRegex(item.fileName)}"[^>]*>`), () => `<style>${css}</style>`);
          Reflect.deleteProperty(bundle, nome);
        }
      }
      const csp = [
        "default-src 'none'",
        `script-src ${scripts.map(sha256).join(' ')}`,
        `style-src ${estilos.map(sha256).join(' ')}`,
        'img-src data:',
        "connect-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
      ].join('; ');
      fonte = fonte.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      html.source = fonte;
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,
    rolldownOptions: {
      input: 'recuperacao.html',
      output: { inlineDynamicImports: true },
    },
  },
  plugins: [tudoNumArquivo()],
});
