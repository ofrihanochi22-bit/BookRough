/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional on purpose: a developer with no .env should hit the documented
  // localhost fallback in api/client.ts, not a request to "undefined/...".
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
