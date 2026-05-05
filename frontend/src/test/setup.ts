/**
 * Vitest global test setup for the frontend.
 *
 * Runs before every test file. It:
 *   1. Imports @testing-library/jest-dom so matchers like `toBeInTheDocument()`
 *      are available in every test without explicit import.
 *   2. Mocks import.meta.env so components don't crash on missing env vars in tests.
 *
 * Referenced by `vite.config.ts → test.setupFiles`.
 */

import "@testing-library/jest-dom";
import { vi } from "vitest";

// Default env stubs for tests — override per-test if needed
vi.stubGlobal("import.meta", {
  env: {
    VITE_API_BASE_URL: "http://localhost:4000",
    VITE_GOOGLE_CLIENT_ID: "test-google-client-id",
    DEV: false,
    PROD: false,
    MODE: "test",
  },
});
