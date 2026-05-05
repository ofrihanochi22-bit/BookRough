/**
 * E2E: register → logout → login loop.
 *
 * Covers UC-1 (registration), UC-2 (login), UC-3 (logout).
 * Requires both backend and frontend dev servers to be running
 * (playwright.config.ts starts them automatically via webServer).
 *
 * The test DB is reset before each spec so runs are idempotent.
 */

import { test, expect } from "@playwright/test";
import { resetDatabase, closePool } from "../utils/db.js";

// Unique email per run so parallel CI jobs don't clash (single worker here)
const EMAIL = `e2e_${Date.now()}@example.com`;
const PASSWORD = "Test1234";
const USERNAME = `e2euser${Date.now().toString().slice(-6)}`;
const DISPLAY_NAME = "E2E User";

test.beforeEach(resetDatabase);

test.afterAll(closePool);

test("user can register, reach the dashboard, log out, and log back in", async ({
  page,
}) => {
  // ── 1. Visit the landing page ────────────────────────────────────────────
  await page.goto("/");
  await expect(page).toHaveURL("/");

  // ── 2. Navigate to Register ──────────────────────────────────────────────
  await page.getByRole("link", { name: /sign up|create account/i }).click();
  await expect(page).toHaveURL("/signup");

  // ── 3. Fill the registration form ────────────────────────────────────────
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/username/i).fill(USERNAME);
  await page.getByLabel(/display name/i).fill(DISPLAY_NAME);
  await page.getByLabel(/password/i).fill(PASSWORD);

  // Select preferred streaming service (Spotify is the default; keep it)
  await page.getByRole("button", { name: /sign up|create account|register/i }).click();

  // ── 4. Should land on the Dashboard ──────────────────────────────────────
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText(DISPLAY_NAME)).toBeVisible();

  // ── 5. Log out ───────────────────────────────────────────────────────────
  await page.getByRole("button", { name: /log out|logout|sign out/i }).click();

  // Should return to Welcome or Login
  await expect(page).toHaveURL(/^\/(login)?$/);

  // ── 6. Navigate to Login (if redirected to Welcome) ───────────────────────
  if (page.url().endsWith("/")) {
    await page.getByRole("link", { name: /log in|login/i }).click();
  }
  await expect(page).toHaveURL("/login");

  // ── 7. Fill the login form and submit ────────────────────────────────────
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /log in|login|sign in/i }).click();

  // ── 8. Should be on the dashboard again ──────────────────────────────────
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText(DISPLAY_NAME)).toBeVisible();
});

test("guest visiting /dashboard is redirected to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login");
});

test("authed user visiting /login is redirected to /dashboard", async ({
  page,
  context,
}) => {
  // Register and capture the session cookie
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/username/i).fill(USERNAME);
  await page.getByLabel(/display name/i).fill(DISPLAY_NAME);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign up|create account|register/i }).click();
  await expect(page).toHaveURL("/dashboard");

  // Navigating to /login while authed should bounce back to /dashboard
  await page.goto("/login");
  await expect(page).toHaveURL("/dashboard");
});
