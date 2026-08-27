// The single source of truth for the decision-layer `stance` values — the
// user's post-outcome read on a *decision* entry: would they stand by the call,
// feel mixed, or not make it again. One list feeds the DB CHECK constraint and
// Drizzle's column typing (src/db/schema.ts) and any TS that narrows a stance,
// so the allowed set can never drift between the database and the code.
export const stanceValues = ["stand_by", "mixed", "wouldnt_again"] as const;

export type Stance = (typeof stanceValues)[number];
