import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
// Self-hosted, so the offline PWA has them and no request reaches Google
// before the user chooses to sign in (docs/features/google-auth.md §5.1).
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk/500.css';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
    {/* Top-centre: clears the notch and stays out from under a thumb. */}
    <Toaster position="top-center" />
  </StrictMode>,
);
