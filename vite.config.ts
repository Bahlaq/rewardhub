import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Relative base is required for Capacitor iOS builds loaded via
  // capacitor://localhost. Keeps asset references portable.
  base: './',

  server: {
    port: 3000,
    host: '0.0.0.0',
  },

  build: {
    // ------------------------------------------------------------------
    // IMPORTANT: Appflow's iOS pipeline hard-checks for a `www/` folder
    // at project root (inherited from Ionic CLI conventions), regardless
    // of what capacitor.config.ts declares as webDir. To keep Appflow
    // happy AND stay consistent with Capacitor, we build to `www/` and
    // point webDir at the same folder.
    // ------------------------------------------------------------------
    outDir: 'www',
    emptyOutDir: true,
    sourcemap: true,
  },
});
