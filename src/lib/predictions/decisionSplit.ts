export interface DecisionSplit {
  decision: string | null;
  text: string;
}

/**
 * The one place capture's two above-the-fold fields (docs/06-decision-layer.md §2.1)
 * become the stored decision/text pair. Identical fields ⇒ a pure forecast: `decision`
 * null, `text` the shared claim. Differing fields ⇒ a decision entry: the first field is
 * the decision, the second — always the scoreable claim — is `text`. Callers pass
 * already-trimmed strings (the zod schema trims before this runs).
 */
export function deriveDecisionAndText(decisionOrClaim: string, criterion: string): DecisionSplit {
  return decisionOrClaim === criterion
    ? { decision: null, text: decisionOrClaim }
    : { decision: decisionOrClaim, text: criterion };
}
