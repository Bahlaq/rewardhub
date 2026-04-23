function renderFatal(title: string, detail: string) {
  try {
    const root = document.getElementById('root') || document.body;
    root.innerHTML = `
      <div style="
        position:fixed;inset:0;padding:16px;
        font:13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;
        background:#fff;color:#111;overflow:auto;z-index:999999;">
        <div style="font-weight:700;color:#b00020;margin-bottom:8px;font-size:16px;">
          ${title}
        </div>
        <pre style="white-space:pre-wrap;word-break:break-word;margin:0;
          background:#f6f6f6;padding:12px;border-radius:8px;">
${detail.replace(/</g, '&lt;')}
        </pre>
      </div>`;
  } catch {
    console.error(title, detail);
  }
}

window.addEventListener('error', (e) => {
  const err = e.error || e.message;
  const isOpaque =
    (typeof e.message === 'string' && e.message === 'Script error.') ||
    (!e.filename && !e.lineno && !e.error);

  if (isOpaque) {
    renderFatal(
      'Script error (details hidden by WebView)',
      [
        'The WebView scrubbed the error details because the script was',
        'marked with the `crossorigin` attribute.',
        '',
        'Fix: remove `crossorigin` from the <script> tags in the built',
        'index.html. In vite.config.ts, use the `capacitorHtmlFixes`',
        'plugin that strips it at build time.',
        '',
        'If you see this AFTER applying that fix, the real cause is',
        'usually one of:',
        '  • A syntax error in a chunk the current WebView cannot parse',
        '  • A dynamic import() resolving to a path that does not exist',
        '  • A <script src> in index.html that 404s',
      ].join('\n')
    );
    return;
  }

  renderFatal(
    'Uncaught JS error',
    (err && err.stack) ||
      String(err) + '\n' + (e.filename || '') + ':' + (e.lineno || '')
  );
});

window.addEventListener('unhandledrejection', (e) => {
  const r: any = e.reason;
  renderFatal(
    'Unhandled promise rejection',
    (r && r.stack) || (r && r.message) || JSON.stringify(r)
  );
});

// Extra: listen for script load failures (these do NOT fire `error` on
// window — they fire on the script element in capture phase).
window.addEventListener(
  'error',
  (e: any) => {
    if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {
      renderFatal(
        'Asset failed to load',
        `${e.target.tagName}: ${e.target.src || e.target.href || '(no src)'}\n` +
          'This usually means a file is missing from the `www/` bundle or\n' +
          'a relative path is wrong. Check that vite.config.ts has\n' +
          '  base: "./"  and  build.outDir: "www"'
      );
    }
  },
  true // capture — required to see resource-load errors
);
import './index.css';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
