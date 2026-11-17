import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const preloadRecoveryKey = 'stock-audit-preload-recovery';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const lastReload = Number(sessionStorage.getItem(preloadRecoveryKey));
  if (lastReload && Date.now() - lastReload < 30_000) {
    sessionStorage.removeItem(preloadRecoveryKey);
    return;
  }
  sessionStorage.setItem(preloadRecoveryKey, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(<App />);
