import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// ════════════════════════════════════════════════════════════════════
//  Runtime error handling lives as an INLINE SCRIPT at the top of
//  index.html — it's registered synchronously before this module is
//  even parsed, so it catches parse errors and early load failures
//  that a handler inside main.tsx would miss.
//
//  The <ErrorBoundary> below handles React-tree errors once the app
//  has mounted. The inline handler handles everything else.
//
//  Do NOT re-add an `window.addEventListener('error', ...)` block
//  here — it would duplicate the one in index.html.
// ════════════════════════════════════════════════════════════════════

const rootElement = document.getElementById('root');

if (!rootElement) {
  // Should be impossible — index.html always contains <div id="root">.
  // If this ever fires, the inline handler in index.html will surface it.
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// --------------------------------------------------------------------
// Remove the "Loading RewardHub…" splash once React has committed its
// first render. queueMicrotask fires right after React's synchronous
// mount phase, so the splash disappears the instant the real UI is
// ready — no visible flash.
// --------------------------------------------------------------------
queueMicrotask(() => {
  const loader = document.getElementById('rh-loader');
  if (loader && loader.parentNode) {
    loader.parentNode.removeChild(loader);
  }
});
