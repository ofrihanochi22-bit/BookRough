/**
 * Application entrypoint.
 *
 * Provider stack (outermost → innermost):
 *   1. ErrorBoundary     — catches React render crashes before any provider fires
 *   2. BrowserRouter     — enables React Router hooks throughout the tree
 *   3. GoogleOAuthProvider — wires the Google OAuth client ID to @react-oauth/google
 *   4. Toaster           — react-hot-toast portal (positioned top-right)
 *   5. App               — the route table
 *
 * After mounting, `hydrate()` is called once to restore the session from the
 * existing JWT cookie (if any) without a visible loading flash on page reload.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAuthStore } from "./stores/authStore";
import App from "./App";
import "./index.css";

// Kick off session hydration before the first render so route guards have
// up-to-date auth state as quickly as possible.
useAuthStore.getState().hydrate();

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: "8px",
                fontSize: "14px",
              },
            }}
          />
          <App />
        </GoogleOAuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
