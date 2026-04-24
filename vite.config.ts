import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Strips crossorigin + integrity from every HTML asset in the bundle.
// generateBundle fires AFTER Vite/Rollup have already injected those
// attributes, so this is the only reliable place to remove them.
function capacitorIosFixes(): Plugin {
  return {
    name: 'capacitor-ios-fixes',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName];
        if (fileName.endsWith('.html') && chunk.type === 'asset') {
          const src =
            typeof chunk.source === 'string'
              ? chunk.source
              : Buffer.from(chunk.source as Uint8Array).toString('utf-8');
          chunk.source = src
            .replace(/\s+crossorigin(="[^"]*")?/g, '')
            .replace(/\s+integrity="[^"]*"/g, '');
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), capacitorIosFixes()],

  // Relative base is required for capacitor:// / custom-scheme URLs.
  base: './',

  server: {
    port: 3000,
    host: '0.0.0.0',
  },

  // Pre-bundle deps through esbuild so the same target applies to
  // node_modules in both dev and production.
  optimizeDeps: {
    esbuildOptions: {
      // Match the production build target so there are no
      // syntax surprises between dev and prod bundles.
      target: ['safari14', 'chrome87', 'edge88', 'firefox78'],
    },
  },

  build: {
    outDir: 'www',
    emptyOutDir: true,
    sourcemap: false,

    // ── Syntax target ────────────────────────────────────────────────
    // Listing every target browser forces esbuild to transform ALL
    // syntax that ANY of these browsers can't handle — private class
    // fields, static class blocks, optional catch bindings, etc.
    // Safari 14 is the most restrictive; the others keep parity with
    // common desktop versions from the same era.
    target: ['safari14', 'chrome87', 'edge88', 'firefox78'],

    // Disable module preload — emits <link crossorigin modulepreload>
    // which WKWebView rejects under the capacitor:// scheme.
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
