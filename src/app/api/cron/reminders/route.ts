import { NextResponse } from "next/server";
import { REMINDER_FROM_ADDRESS, getResendClient } from "@/lib/email/resend";
import {
  dueDateString,
  groupDueByUser,
  isAuthorized,
  type DuePrediction,
} from "@/lib/reminders/remindersCore";
import { claimDueReminders, releaseReminders } from "@/lib/reminders/query";
import { getUserEmail } from "@/lib/supabase/admin";

// Secret-guarded cron/webhook route (the sanctioned exception to Server
// Actions — docs §7). Vercel Cron attaches `Authorization: Bearer $CRON_SECRET`
// automatically when CRON_SECRET is set on the project; vercel.json needs no
// header config. Node runtime — talks to Drizzle (postgres-js) and the
// Supabase admin API directly.
export const runtime = "nodejs";

function buildReminderEmail(predictions: DuePrediction[], siteUrl: string) {
  const lines = predictions.map((p) => `- ${p.text}\n  ${siteUrl}/predictions/${p.id}/resolve`);
  const text = `You have ${predictions.length} prediction${predictions.length === 1 ? "" : "s"} due for resolution today:\n\n${lines.join("\n\n")}`;
  return {
    subject: `${predictions.length} prediction${predictions.length === 1 ? "" : "s"} due today`,
    text,
  };
}

/**
 * A misconfigured prod deploy without SITE_URL would silently email every
 * user a localhost resolve link — fail the run instead. Local/preview dev
 * still falls back so `npm run dev` works without setting it.
 */
function resolveSiteUrl(): string {
  const siteUrl = process.env.SITE_URL;
  if (siteUrl) return siteUrl;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SITE_URL is not set");
  }
  return "http://localhost:3000";
}

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response(null, { status: 401 });
  }

  let dueRows: DuePrediction[];
  let siteUrl: string;
  try {
    // Resolve config BEFORE claiming: `claimDueReminders` marks rows reminded, so
    // a prod misconfig (SITE_URL unset) must fail here — before any row is
    // claimed — rather than after, which would mark rows reminded and then throw,
    // silently dropping today's reminders.
    siteUrl = resolveSiteUrl();
    dueRows = await claimDueReminders(dueDateString(new Date()));
  } catch (error) {
    // Top-level claim / config failure (DB down, SITE_URL unset in prod). Log
    // the class name only (privacy) and fail the run with a 500 — the per-user
    // send loop below is already individually guarded.
    const kind = error instanceof Error ? error.name : "UnknownError";
    console.error("reminders: run failed before sending", kind);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const byUser = groupDueByUser(dueRows);

  let usersEmailed = 0;
  const resend = getResendClient();

  for (const [userId, predictions] of byUser) {
    try {
      const email = await getUserEmail(userId);
      if (!email) {
        // No identifying info logged — see query.ts for why this route treats
        // user identity as sensitive. The row stays claimed (marked reminded):
        // its resolution_date won't match "today" on a later run anyway, so
        // there is nothing to retry.
        console.error("reminders: no email found for a due user");
        continue;
      }
      const { subject, text } = buildReminderEmail(predictions, siteUrl);
      await resend.emails.send({ from: REMINDER_FROM_ADDRESS, to: email, subject, text });
      usersEmailed += 1;
    } catch (error) {
      // Send threw AFTER we claimed these rows. Release the claim so a later run
      // can retry — this run holds them exclusively (SKIP LOCKED), so releasing
      // can't collide with a concurrent run. This is at-least-once: if the send
      // actually delivered before throwing, the retry may duplicate — an
      // accepted trade over silently dropping the reminder (see releaseReminders).
      // Best-effort: if the release itself fails, the reminder just isn't retried.
      await releaseReminders(predictions.map((p) => p.id)).catch(() => {});
      // Log an error class name only — never the raw error object or its
      // message, which can echo the recipient address or request payload
      // (CLAUDE.md: prediction content never in logs; no user-identifying
      // info in logs either).
      const kind = error instanceof Error ? error.name : "UnknownError";
      console.error("reminders: failed to email a user", kind);
    }
  }

  return NextResponse.json({ users_emailed: usersEmailed, predictions_due: dueRows.length });
}
