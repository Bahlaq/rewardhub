// ════════════════════════════════════════════════════════════════════
//  Paste this block at the VERY TOP of src/main.tsx — before any other
//  imports that might throw. It catches any uncaught error or promise
//  rejection and renders it visibly to the screen so you can read it
//  directly on the phone instead of a white void.
//
//  Once the white screen is fixed, you can leave this in place or
//  wrap it in `if (import.meta.env.DEV)` for dev-only visibility.
// ════════════════════════════════════════════════════════════════════

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
    // If even this fails, the console is all we have.
    console.error(title, detail);
  }
}

window.addEventListener('error', (e) => {
  const err = e.error || e.message;
  renderFatal(
    'Uncaught JS error',
    (err && err.stack) || String(err) + '\n' + (e.filename || '') + ':' + (e.lineno || '')
  );
});

window.addEventListener('unhandledrejection', (e) => {
  const r: any = e.reason;
  renderFatal(
    'Unhandled promise rejection',
    (r && r.stack) || (r && r.message) || JSON.stringify(r)
  );
});

// ════════════════════════════════════════════════════════════════════
// ...after this block, your existing main.tsx imports and ReactDOM
// render call continue normally. Do NOT wrap them in try/catch — the
// listeners above catch everything.
// ════════════════════════════════════════════════════════════════════
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
