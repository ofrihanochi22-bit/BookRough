import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AppToaster } from './components/AppToaster';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBar } from './components/OfflineBar';
import { UpdatePrompt } from './components/UpdatePrompt';
// Self-hosted, so the offline PWA has them and no request reaches Google
// before the user chooses to sign in (docs/features/google-auth.md §5.1).
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk/500.css';
// Mixtape's heading face (docs/features/ui-redesign.md §3.3).
import '@fontsource-variable/bricolage-grotesque';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {/* The service worker's update bar and the offline bar (docs/features/pwa-offline.md §5). */}
        <UpdatePrompt />
        <OfflineBar />
        <div className="min-h-0 flex-1">
          <App />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
    <AppToaster />
  </StrictMode>,
);
