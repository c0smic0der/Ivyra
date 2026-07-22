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
    // Native <input type="date"> sends "YYYY-MM-DD".
    resolutionDate: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date"),
  })
  .refine(
    (data) => {
      const resolutionMidnight = new Date(`${data.resolutionDate}T00:00:00`);
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      return resolutionMidnight.getTime() > todayMidnight.getTime();
    },
    {
      message: "Resolution date must be in the future",
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
