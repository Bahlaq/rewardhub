import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
            .replace(/\s+crossorigin(="[^"]*")?/g, '')
            .replace(/\s+integrity="[^"]*"/g, '');
        }
      }
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
      target: ['safari14', 'chrome87', 'edge88', 'firefox78'],
    },
  },

  build: {
    outDir: 'www',
    emptyOutDir: true,
    sourcemap: false,
    target: ['safari14', 'chrome87', 'edge88', 'firefox78'],
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
