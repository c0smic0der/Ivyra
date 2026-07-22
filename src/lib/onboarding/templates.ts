// Starter templates offered on onboarding screen 2 — shared with the capture
// form so a tapped template prefills `PredictionForm` via `?template=<key>`.
export interface OnboardingTemplate {
  key: string;
  label: string;
  text: string;
  kind: "self" | "world";
  confidence: number;
}

export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    key: "deadline",
    label: "A deadline",
    text: "I finish my current top priority by Friday",
    kind: "self",
    confidence: 70,
  },
  {
    key: "habit",
    label: "A habit",
    text: "I work out at least 3 times this week",
    kind: "self",
    confidence: 80,
  },
  {
    key: "work",
    label: "A work outcome",
    text: "My team hits its deadline this sprint",
    kind: "world",
    confidence: 60,
  },
];
