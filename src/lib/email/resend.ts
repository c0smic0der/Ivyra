import "server-only";
import { Resend } from "resend";

let client: Resend | null = null;

/** Lazily-constructed singleton — reads RESEND_API_KEY from env. */
export function getResendClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Sender on the app's own domain. Requires the ivyra.app domain to be verified
// with Resend for delivery.
export const REMINDER_FROM_ADDRESS = "Ivyra <hello@ivyra.app>";
