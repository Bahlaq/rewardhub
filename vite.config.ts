import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function capacitorIosFixes(): Plugin {
  return {
    name: 'capacitor-ios-fixes',
    enforce: 'post',
    transformIndexHtml(html) {
      // Strip crossorigin/integrity (WKWebView CORS issues)
      html = html.replace(/\s+crossorigin(="[^"]*")?/g, '');
      html = html.replace(/\s+integrity="[^"]*"/g, '');

      // Convert static <script type="module" src="..."> to dynamic import().
      // WKWebView surfaces errors from static module scripts as opaque
      // "Script error." with no filename. Dynamic import() rejections carry
      // the real Error object + stack trace, making crashes debuggable.
      html = html.replace(
        /<script type="module" src="([^"]+)"><\/script>/g,
        (_, src) =>
          `<script type="module">` +
          `import("${src}").catch(function(e){` +
          `window.__rhShow&&window.__rhShow(` +
          `"Boot error — real details",` +
          `e&&(e.stack||e.message)||String(e)` +
          `)});` +
          `</script>`,
      );

      return html;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), capacitorIosFixes()],

  base: './',

  server: {
    port: 3000,
    host: '0.0.0.0',
  },

  optimizeDeps: {
    esbuildOptions: {
      target: 'es2015',
    },
  },

  build: {
    outDir: 'www',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2015',
    modulePreload: false,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
