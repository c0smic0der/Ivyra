import type { Profile } from "@/lib/scoring";

// The one-line headline verdict at the top of /insights — a deterministic,
// templated read of the user's own numbers (NOT an AI narration and NOT a score:
// it only phrases the profile the scoring module already assigned).
//
// It is DESCRIPTIVE ONLY: it states what is, never what to do. Any "here's how to
// fix it" belongs to the AI insight card, which is built for exactly that. Keep
// this observational so the two never step on each other.

export type VerdictTone = "positive" | "caution" | "neutral" | "locked";

export interface Verdict {
  headline: string;
  /** A supporting sentence, or null when the headline stands alone. */
  sub: string | null;
  /** Drives the status-dot colour (and an sr-only label). */
  tone: VerdictTone;
}

/** How far the bias must sit from zero (in probability, i.e. 2 points) before the
 *  miscalibrated verdict names a direction rather than a generic mismatch. */
const BIAS_DIRECTION_DEADBAND = 0.02;

export function buildVerdict(input: { n: number; profile: Profile; biasValue: number | null }): Verdict {
  const { n, profile, biasValue } = input;

  if (n === 0) {
    return {
      headline: "No resolutions yet",
      sub: "Resolve a few predictions and your calibration picture appears here.",
      tone: "locked",
    };
  }

  if (profile === "insufficient_data") {
    return {
      headline: "Your calibration picture is still forming",
      sub: `Only ${n} resolved so far — still early to read a pattern.`,
      tone: "neutral",
    };
  }

  if (profile === "calibrated_and_bold") {
    return {
      headline: "You're calibrated and bold",
      sub: "Your confidence tracks reality and commits at the same time.",
      tone: "positive",
    };
  }

  if (profile === "hedger") {
    return {
      headline: "Well-calibrated, but you tend to hedge",
      sub: "Your calls are honest; they just stay close to 50/50.",
      tone: "neutral",
    };
  }

  // miscalibrated — name the direction when the bias is clearly one-sided. Purely
  // observational: the correction lives in the AI insight, not here.
  const dir =
    biasValue === null
      ? null
      : biasValue > BIAS_DIRECTION_DEADBAND
        ? "over"
        : biasValue < -BIAS_DIRECTION_DEADBAND
          ? "under"
          : null;

  if (dir === "over") {
    return {
      headline: "You lean overconfident",
      sub: "Your high-confidence calls come true less often than you claim.",
      tone: "caution",
    };
  }
  if (dir === "under") {
    return {
      headline: "You lean underconfident",
      sub: "Outcomes come true more often than your confidence suggests.",
      tone: "caution",
    };
  }
  return {
    headline: "Your confidence and outcomes don't line up yet",
    sub: "The gap between what you predict and what happens is still wide.",
    tone: "caution",
  };
}

/** A short, neutral status word — used only as an sr-only label on the status dot
 *  (the dot's colour is the visible signal). Deliberately non-judgmental: no
 *  "needs work", nothing prescriptive. */
export function verdictToneLabel(tone: VerdictTone): string {
  switch (tone) {
    case "positive":
      return "strong";
    case "caution":
      return "mixed";
    case "neutral":
      return "forming";
    case "locked":
      return "locked";
  }
}
