import { z } from "zod";

// The scoped-insight output contract (docs §9.4). The model returns ONLY prose —
// one string. It carries no numbers of its own: every figure it may cite was
// supplied in the prompt from the deterministic scoring engine, and
// `additionalProperties: false` means the model cannot smuggle a fabricated
// statistic back through the tool call. This is the structural half of the
// "the LLM narrates, code grades" split — the schema itself refuses a score.

export const scopedInsightOutputSchema = z
  .object({
    insight: z.string().trim().min(1),
  })
  .strict();

export type ScopedInsightOutput = z.infer<typeof scopedInsightOutputSchema>;

/** The single tool the model is forced to call (tool_choice pins this name). */
export const scopedInsightTool = {
  name: "write_insight",
  description:
    "Write a 2-3 sentence calibration insight that narrates the supplied statistics and states the correction for the pre-assigned profile.",
  input_schema: {
    type: "object" as const,
    properties: {
      insight: {
        type: "string",
        description:
          "2-3 short sentences naming the pattern in the supplied numbers and stating the correction for the given profile. No headings, no bullets, no sign-off.",
      },
    },
    required: ["insight"],
    additionalProperties: false,
  },
};
