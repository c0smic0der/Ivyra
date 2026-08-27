import { predictionKindValues } from "./validation";

/** 'self' | 'world' — derived from the validation source, never re-declared. */
export type PredictionKind = (typeof predictionKindValues)[number];

/** The minimal shape needed to derive a prediction's kind. */
export interface KindDerivable {
  /** Non-null on a *decision* entry (the user's own action); null on a forecast. */
  decision?: string | null;
  /** The stored self/world choice — only consulted for forecasts. */
  predictionKind: string;
}

/**
 * The one place prediction_kind is decided. A decision entry is about the user's
 * own action, so any non-null `decision` forces kind 'self'; otherwise the stored
 * self/world choice stands. Every write path derives kind through this — it is
 * never set inline (CLAUDE.md: two paths that must agree ⇒ one derives from the
 * other), so the day a decision-capture UI exists, decisions become 'self'
 * everywhere at once with no site left behind.
 *
 * `!= null` (loose) so an absent/undefined `decision` behaves exactly like an
 * explicit null. Throws on the malformed case — no decision and an unrecognized
 * stored kind — which is unreachable in production (the form value is
 * zod-validated to self/world) but documents that kind must be well-formed.
 */
export function kindFor(entry: KindDerivable): PredictionKind {
  if (entry.decision != null) return "self";
  if (entry.predictionKind === "self" || entry.predictionKind === "world") {
    return entry.predictionKind;
  }
  throw new Error("kindFor: entry has neither a decision nor a valid prediction kind");
}
