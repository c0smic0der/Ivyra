import type { FrequencyGap, Profile } from "@/lib/scoring";

// The one-line headline verdict at the top of /insights — a deterministic,
// templated read of the user's own numbers (NOT an AI narration and NOT a score:
// it phrases the frequency gap and the profile the scoring module already
// computed; it never does the math itself and the component never does either).
//
// The headline LEADS WITH THE FREQUENCY GAP as a one-line OVERALL summary of the
// user's record — "On average you claimed 85% certainty, and things you predicted
// panned out 38% of the time" — for every scope with enough data. Every string
// reports a frequency; none evaluates whether a call was good, wise, or right
// (CLAUDE.md copy rule). It is DESCRIPTIVE ONLY: it states what is, never what to
// do. Any "here's how to fix it" belongs to the AI insight card.

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

/**
 * The frequency-gap headline: an explicit ONE-LINE OVERALL summary, so it reads
 * as a running average of the user's own record rather than a fact about one
 * confidence level. Both numbers come from the scoring module's `frequencyGap`
 * (mean stated confidence, overall hit rate) — this only rounds to whole percents
 * for display. States frequencies and stops (CLAUDE.md copy rule).
 */
export function frequencyGapHeadline(gap: FrequencyGap): string {
  const stated = Math.round(gap.meanConfidence * 100);
  const actual = Math.round(gap.actualFrequency * 100);
  return `On average you claimed ${stated}% certainty, and things you predicted panned out ${actual}% of the time.`;
}

export function buildVerdict(input: {
  n: number;
  profile: Profile;
  biasValue: number | null;
  /** The scoring module's mean-confidence / actual-frequency pair (lifetime). */
  gap: FrequencyGap | null;
}): Verdict {
  const { n, profile, biasValue, gap } = input;

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

  // Every scope with enough data LEADS WITH THE FREQUENCY GAP. `gap` is non-null
  // whenever n > 0 (so the fallback is unreachable here), but keeps this total.
  const headline = gap ? frequencyGapHeadline(gap) : "Your calibration picture is still forming";

  if (profile === "calibrated_and_bold") {
    return {
      headline,
      sub: "Your confidence tracks how often things actually happen, across the full range.",
      tone: "positive",
    };
  }

  if (profile === "hedger") {
    return {
      headline,
      sub: "Your calls land about as often as you say — your confidence just stays near 50/50.",
      tone: "neutral",
    };
  }

  // miscalibrated — name the direction of the gap when the bias is clearly
  // one-sided. Every sub reports a frequency relationship; none prescribes.
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
      headline,
      sub: "Your high-confidence calls come true less often than you claim.",
      tone: "caution",
    };
  }
  if (dir === "under") {
    return {
      headline,
      sub: "Outcomes come true more often than your confidence suggests.",
      tone: "caution",
    };
  }
  return {
    headline,
    sub: "The gap between the confidence you state and how often it happens is still wide.",
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
