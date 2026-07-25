import "server-only";
import { Resend } from "resend";

let client: Resend | null = null;

/** Lazily-constructed singleton — reads RESEND_API_KEY from env. */
export function getResendClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Sandbox sender — the app's own domain isn't verified with Resend yet.
// Swap once a verified domain is set up.
export const REMINDER_FROM_ADDRESS = "Marne <onboarding@resend.dev>";
