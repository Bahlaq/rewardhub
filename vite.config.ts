import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ════════════════════════════════════════════════════════════════════
// capacitorHtmlFixes
// --------------------------------------------------------------------
// On iOS, Capacitor loads the app from `capacitor://localhost/`. Vite
// emits `<script type="module" crossorigin ...>` by default, which
// triggers WKWebView's cross-origin error scrubbing — every runtime
// error becomes "Script error." with no stack, no filename, no line.
// Removing the `crossorigin` attribute restores full error visibility
// and also fixes silent script-load failures on older iOS versions.
//
// This plugin also strips `type="module"` import of `modulepreload`
// link tags for the same reason.
// ════════════════════════════════════════════════════════════════════
function capacitorHtmlFixes(): Plugin {
  return {
    name: 'capacitor-html-fixes',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        // Strip crossorigin from every tag that has it
        .replace(/\s+crossorigin(="[^"]*")?/g, '')
        // Also strip crossorigin from preload links
        .replace(/<link\s+rel="modulepreload"([^>]*)>/g, (_m, rest) =>
          `<link rel="modulepreload"${rest.replace(/\s+crossorigin(="[^"]*")?/g, '')}>`
        );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), capacitorHtmlFixes()],

  // Relative paths are mandatory for the `capacitor://` iOS scheme.
  base: './',

  server: {
    port: 3000,
    host: '0.0.0.0',
  },

  build: {
    // Must be `www` for Appflow's iOS pipeline — see earlier fix.
    outDir: 'www',
    emptyOutDir: true,
    sourcemap: true,

    // ------------------------------------------------------------------
    // Target older Safari so the bundle doesn't use syntax that fails
    // silently on the WKWebView shipped with iOS 14–15. Any syntax the
    // WebView can't parse ALSO produces "Script error." with no detail.
    // ------------------------------------------------------------------
    target: ['es2020', 'safari14'],

    // Keep modulepreload polyfill disabled — the polyfill injects its
    // own fetch calls that fail under capacitor:// without CORS headers.
    modulePreload: { polyfill: false },

    rollupOptions: {
      output: {
        // Disable manualChunks optimizations that can break relative
        // resolution under capacitor://. Let Vite chunk normally.
        manualChunks: undefined,
      },
    },
  },
});
