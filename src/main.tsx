import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from "./contexts/LanguageContext.tsx";

// Safe confirm & alert fallbacks for sandboxed iframes
const originalConfirm = window.confirm;
window.confirm = function (message?: string): boolean {
  try {
    return originalConfirm.call(window, message);
  } catch (e) {
    console.warn("window.confirm was blocked by sandbox. Defaulting to true.", e);
    return true; // Default to true inside sandboxed iframes to prevent blocking user deletions/edits
  }
};

const originalAlert = window.alert;
window.alert = function (message?: any): void {
  try {
    originalAlert.call(window, message);
  } catch (e) {
    console.warn("window.alert was blocked by sandbox. Message:", message, e);
  }
};

// Suppress benign WebSocket/HMR errors to prevent full-screen unhandled rejection popups
window.addEventListener('error', (event) => {
  const msg = event?.message || "";
  if (
    msg.includes('WebSocket') ||
    msg.includes('websocket') ||
    msg.includes('vite') ||
    msg.includes('HMR')
  ) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event?.reason;
  if (reason) {
    const msg = typeof reason === 'string' ? reason : (reason.message || '');
    if (
      msg.includes('WebSocket') ||
      msg.includes('websocket') ||
      msg.includes('vite') ||
      msg.includes('HMR')
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
