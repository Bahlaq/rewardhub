import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ════════════════════════════════════════════════════════════════════
// capacitorIosFixes
// --------------------------------------------------------------------
// Uses the `generateBundle` hook (NOT `transformIndexHtml`) because
// Vite's core adds the `crossorigin` attribute during bundling, AFTER
// all `transformIndexHtml` hooks have run. `generateBundle` fires
// right before files are written to disk — it's the only reliable
// place to guarantee the attribute is removed from the final HTML.
// ════════════════════════════════════════════════════════════════════
function capacitorIosFixes(): Plugin {
  return {
    name: 'capacitor-ios-fixes',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName];
        if (fileName.endsWith('.html') && chunk.type === 'asset') {
          const original =
            typeof chunk.source === 'string'
              ? chunk.source
              : Buffer.from(chunk.source as Uint8Array).toString('utf-8');
          chunk.source = original
            // Strip every crossorigin attribute — the root cause of the
            // opaque "Script error." on iOS WKWebView.
            .replace(/\s+crossorigin(="[^"]*")?/g, '')
            // Strip integrity hashes for the same reason (they force a
            // cross-origin check iOS can't satisfy under capacitor://).
            .replace(/\s+integrity="[^"]*"/g, '');
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), capacitorIosFixes()],

  // Required for capacitor:// scheme on iOS.
  base: './',

  server: {
    port: 3000,
    host: '0.0.0.0',
  },

  build: {
    // Appflow's iOS pipeline requires this folder name.
    outDir: 'www',
    emptyOutDir: true,

    // Source maps off keeps the bundle small for mobile and removes
    // an extra cross-origin fetch that WKWebView can trip on.
    sourcemap: false,

    // Conservative target — works on every iPhone that can run iOS 14.
    target: ['es2020', 'safari14'],

    // Disable modulepreload entirely (not just the polyfill). The
    // polyfill injects fetch() calls; the non-polyfill version emits
    // <link rel="modulepreload" crossorigin ...> which we'd have to
    // strip again. Simplest to turn it off.
    modulePreload: false,

    cssCodeSplit: true,
    assetsInlineLimit: 4096,

    rollupOptions: {
      output: {
        // Let Vite chunk normally but with predictable filenames so
        // asset-load errors in the inline handler point at readable paths.
        manualChunks: undefined,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
