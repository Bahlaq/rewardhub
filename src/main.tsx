import './index.css';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// No StrictMode — it causes double-mount effects which interfere with
// Capacitor plugin initialization (AdMob, PushNotifications, Firebase auth
// state listener all fire twice, causing race conditions on cold start).
createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Remove the "Loading RewardHub…" splash once React has rendered.
queueMicrotask(() => {
  const loader = document.getElementById('rh-loader');
  if (loader && loader.parentNode) {
    loader.parentNode.removeChild(loader);
  }
});
