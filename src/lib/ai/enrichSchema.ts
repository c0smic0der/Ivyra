import { z } from "zod";

// The capture-time enrichment contract (docs/02-application-rundown.md §6, §9.1).
// Deliberately excludes `prediction_kind`: it's a user-selected toggle, already
// known and frozen at capture, so asking the model to re-derive it would spend
// cap budget on a value we already have with certainty.

export const enrichCategoryValues = [
  "work",
  "health",
  "relationships",
  "money",
  "self",
] as const;

export const enrichReasoningTypeValues = [
  "base_rate",
  "specific_evidence",
  "trust_in_person",
  "gut_feel",
  "plan_optimism",
] as const;

export const enrichOutputSchema = z.object({
  category: z.enum(enrichCategoryValues),
  reasoning_type: z.enum(enrichReasoningTypeValues).nullable(),
});

export type EnrichOutput = z.infer<typeof enrichOutputSchema>;

/** The single tool Claude is forced to call (tool_choice pins this name). */
export const enrichTool = {
  name: "categorize_prediction",
  description:
    "Classify a prediction's life-domain category and its evidentiary reasoning style.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        enum: enrichCategoryValues,
        description: "The life domain the prediction belongs to.",
      },
      reasoning_type: {
        type: ["string", "null"],
        enum: [...enrichReasoningTypeValues, null],
        description:
          "The evidentiary style of the stated reasoning, or null if no reasoning was given or none applies.",
      },
    },
    required: ["category", "reasoning_type"],
    additionalProperties: false,
  },
};
