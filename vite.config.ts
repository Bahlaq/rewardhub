import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function capacitorIosFixes(): Plugin {
  return {
    name: 'capacitor-ios-fixes',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/\s+crossorigin(="[^"]*")?/g, '')
        .replace(/\s+integrity="[^"]*"/g, '');
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
