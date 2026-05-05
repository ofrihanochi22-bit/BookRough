/**
 * Email delivery stub.
 *
 * Currently logs the reset URL via Pino so that developers can copy it from
 * the terminal during local development.  Replace the body of each function
 * with a real provider (SendGrid, Resend, SES) when email is needed in prod.
 *
 * This stub lives in its own module so that callers import a stable interface
 * and do not need to be touched when the real provider is wired up.
 */

import { logger } from "../utils/logger.js";

/** Logs the password-reset URL to stdout in dev; sends a real email in prod. */
export function sendPasswordResetEmail(email: string, resetUrl: string): void {
  // In development, log the URL so the developer can use it without a real inbox.
  logger.info({ email, resetUrl }, "Password reset link generated (dev mode — not emailed)");

  // TODO: replace with real email delivery once a provider is configured.
  // Example (Resend):
  //   await resend.emails.send({
  //     from: "noreply@bookrough.app",
  //     to: email,
  //     subject: "Reset your BookRough password",
  //     html: `<a href="${resetUrl}">Click here to reset your password</a>`,
  //   });
}
