import { z } from "zod";

// Pure validation for the capture form. No DB, no auth, no I/O — the Server
// Action delegates entirely to this so the interesting logic (bounds, the
// future-date rule) is unit-testable without mocking Supabase/Drizzle.

export const predictionKindValues = ["self", "world"] as const;

export const createPredictionSchema = z
  .object({
    text: z.string().trim().min(1, "Prediction text is required").max(2000),
    reasoning: z.string().trim().max(1000).optional().or(z.literal("")),
    planOrDisconfirm: z.string().trim().max(1000).optional().or(z.literal("")),
    predictionKind: z.enum(predictionKindValues),
    // UI sends a 1-99 integer (the slider); converted to a 0.01-0.99 DB
    // string by confidencePercentToDbString before it ever reaches Drizzle.
    confidencePercent: z.coerce
      .number()
      .int("Confidence must be a whole number")
      .min(1, "Confidence must be at least 1%")
      .max(99, "Confidence must be at most 99%"),
    // Native <input type="date"> sends a bare "YYYY-MM-DD" calendar date. Pin
    // the shape to exactly that: a strict format check plus a round-trip through
    // UTC rejects both non-ISO strings Date.parse would otherwise accept (e.g.
    // "07/24/2026") and impossible dates that silently roll over ("2099-13-40").
    // Guaranteeing real, zero-padded ISO dates is also what lets the future-date
    // rule below compare them as plain strings.
    resolutionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
      .refine((s) => {
        const d = new Date(`${s}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
      }, "Invalid date"),
  })
  .refine(
    // Same-day allowed, past rejected (>= today). Compare as UTC calendar dates —
    // the ONE convention the whole system uses: `predictions.resolution_date` is
    // a Postgres `date` (no time), and the reminders cron matches "due today" via
    // dueDateString(now) = the UTC date (see remindersCore.ts). A local-midnight
    // comparison drifted with the host's timezone, so capture and the cron could
    // disagree on which calendar day a prediction belonged to. Zero-padded ISO
    // dates sort lexicographically == chronologically, so a string compare is
    // exact here.
    //
    // Today is allowed deliberately (product decision, docs/TODO.md): fast
    // feedback loops are the mechanism calibration training relies on, and a
    // same-day prediction — resolvable the moment its date passes — is the
    // shortest, lowest-friction horizon. It pairs with early resolution, which
    // lets an already-settled prediction be closed before its date.
    (data) => data.resolutionDate >= new Date().toISOString().slice(0, 10),
    {
      message: "Resolution date can’t be in the past",
      path: ["resolutionDate"],
    },
  );

export type CreatePredictionInput = z.infer<typeof createPredictionSchema>;

export interface ValidationResult {
  success: boolean;
  data?: CreatePredictionInput;
  fieldErrors?: Record<string, string[]>;
}

export function validateCreatePredictionInput(raw: unknown): ValidationResult {
  const parsed = createPredictionSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  return { success: true, data: parsed.data };
}

/**
 * UI 1-99 int -> DB 0.01-0.99, formatted as the fixed-precision string
 * Drizzle's `numeric` column type expects (it has no {mode}, so it's typed
 * as string in and out — see src/db/schema.ts).
 */
export function confidencePercentToDbString(pct: number): string {
  return (pct / 100).toFixed(2);
}
