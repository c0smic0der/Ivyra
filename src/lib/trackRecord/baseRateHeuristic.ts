// Base-rate fallback matching (§9.2) — deterministic keyword heuristic, no
// AI. Draft text is matched against base_rates.kind before the prediction is
// saved, so there's no AI-assigned category yet to key off of (that's a
// background call that only runs after save, and uses a different taxonomy
// entirely — work/health/relationships/money/self, not these four kinds).
//
// Order matters: rules are checked in order and the first match wins, so
// more specific patterns (hiring, habits) are listed ahead of the broad
// "by/before/due" deadline catch-all.

interface BaseRateRule {
  kind: string;
  pattern: RegExp;
}

const RULES: BaseRateRule[] = [
  { kind: "hiring_works_out", pattern: /\b(hir(?:e|es|ing|ed)|candidate|new (?:hire|employee))\b/i },
  { kind: "habit_adherence", pattern: /(\d+\s*\+?\s*(?:times|x)\b)|\bevery\s+(?:day|week|weekday)\b|\bhabit\b/i },
  { kind: "project_on_budget", pattern: /\bbudget\b/i },
  { kind: "deadline_hit", pattern: /\b(by|before|deadline|due)\b/i },
];

/** Returns the matched base_rates.kind, or null if nothing matches. */
export function matchBaseRateKind(text: string): string | null {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.kind;
  }
  return null;
}
