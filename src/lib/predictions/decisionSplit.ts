export interface DecisionSplit {
  decision: string;
  text: string;
}

/**
 * The one place capture's two above-the-fold fields (docs/06-decision-layer.md §2.1)
 * become the stored pair. Both fields are required at validation (see validation.ts),
 * so this can never produce a null decision — every new entry is a decision entry.
 * The first field is the decision; the second — always the scoreable claim — is
 * `text`. Callers pass already-trimmed strings (the zod schema trims before this runs).
 */
export function deriveDecisionAndText(decision: string, criterion: string): DecisionSplit {
  return { decision, text: criterion };
}
