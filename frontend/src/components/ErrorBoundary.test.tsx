/**
 * Tests for the root ErrorBoundary.
 *
 * Verifies that:
 *   1. When a child component throws during render, the fallback UI is shown.
 *   2. The "Reload page" button calls window.location.reload().
 *
 * React Testing Library renders into jsdom (configured in vite.config.ts).
 * We suppress React's console.error output for the throw-during-render scenario
 * because React always logs it — it's expected noise in this test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// A component that throws unconditionally — used to trigger the boundary
function Bomb(): never {
  throw new Error("Test explosion");
}

describe("ErrorBoundary", () => {
  // Suppress the React error console noise from the intentional throw
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children normally when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows the fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  it("calls window.location.reload when the reload button is clicked", () => {
    // Mock reload — jsdom doesn't implement it
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reloadMock).toHaveBeenCalledOnce();
  });
});
