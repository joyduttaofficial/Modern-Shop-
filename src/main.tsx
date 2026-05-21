import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
