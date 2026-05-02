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
      // the real Error object + stack trace.
      html = html.replace(
        /<script type="module" src="([^"]+)"><\/script>/g,
        (_, src) =>
          `<script type="module">` +
          `import("${src}").catch(function(e){` +
          `window.__rhShow&&window.__rhShow("Boot error",e&&(e.stack||e.message)||String(e))` +
          `});</script>`,
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
    // Single CSS file — avoids chunk CSS load failures
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        // ─── CRITICAL iOS FIX ────────────────────────────────────────
        // With the default multi-chunk build, WKWebView crashes in any
        // statically-imported secondary chunk are reported as opaque
        // "Script error." with no filename — completely undebuggable,
        // and our import().catch() never fires.
        //
        // inlineDynamicImports:true forces Rollup to produce a SINGLE
        // JS bundle. There are no secondary chunks, so every error is
        // catchable by our import().catch() in index.html.
        // ─────────────────────────────────────────────────────────────
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
