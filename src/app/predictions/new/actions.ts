"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { db, schema } from "@/db";
import { enrichPrediction } from "@/lib/ai/enrich";
import { deriveDecisionAndText } from "@/lib/predictions/decisionSplit";
import { kindFor } from "@/lib/predictions/kind";
import { confidencePercentToDbString, validateCreatePredictionInput } from "@/lib/predictions/validation";
import { createClient } from "@/lib/supabase/server";

export interface CreatePredictionState {
  fieldErrors?: Record<string, string[]>;
  formError?: string;
}

export async function createPrediction(
  _prevState: CreatePredictionState,
  formData: FormData,
): Promise<CreatePredictionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/?signin=1");
  }

  const validated = validateCreatePredictionInput({
    decisionOrClaim: formData.get("decisionOrClaim"),
    criterion: formData.get("criterion"),
    reasoning: formData.get("reasoning"),
    planOrDisconfirm: formData.get("planOrDisconfirm"),
    predictionKind: formData.get("predictionKind"),
    confidencePercent: formData.get("confidencePercent"),
    resolutionDate: formData.get("resolutionDate"),
  });

  if (!validated.success) {
    return { fieldErrors: validated.fieldErrors };
  }
  const input = validated.data!;

  // The above-the-fold split (docs/06-decision-layer.md §2.1): identical fields ⇒ a
  // pure forecast (decision null); differing fields ⇒ a decision entry. The scoreable
  // claim is always `text`. This is the ONLY place that assignment happens.
  const { decision, text } = deriveDecisionAndText(input.decisionOrClaim, input.criterion);

  // Write the row immediately — status=open, criteria frozen at creation.
  // category/reasoningType/embedding start null and are enriched below,
  // entirely outside this request/response cycle. A DB failure here returns a
  // friendly form-level error (the `formError` slot PredictionForm renders)
  // rather than throwing an unhandled 500 at the user.
  let predictionId: string;
  try {
    const [row] = await db
      .insert(schema.predictions)
      .values({
        userId: user.id,
        text,
        decision,
        reasoning: input.reasoning || null,
        planOrDisconfirm: input.planOrDisconfirm || null,
        // prediction_kind is DERIVED through kindFor, never set inline — the one
        // rule for kind (CLAUDE.md). A non-null decision forces 'self' regardless
        // of the chosen self/world toggle.
        predictionKind: kindFor({ decision, predictionKind: input.predictionKind }),
        confidence: confidencePercentToDbString(input.confidencePercent),
        resolutionDate: input.resolutionDate,
        status: "open",
      })
      .returning({ id: schema.predictions.id });
    predictionId = row.id;
  } catch (error) {
    console.error("createPrediction: insert failed", error instanceof Error ? error.name : "UnknownError");
    return { formError: "Couldn't save your prediction. Please try again." };
  }

  // Background enrichment. after() runs post-response (still fires even
  // though we redirect below) — no cookies/session needed here, since we
  // already have userId/predictionId in closure and hit Drizzle directly.
  after(async () => {
    // enrichPrediction degrades internally, but the cap reservation is a DB
    // transaction that could throw (e.g. connection loss). Contain it here so a
    // failure is a logged no-op, never an unhandled post-response rejection —
    // the prediction row is already saved and fully usable without enrichment.
    try {
      await enrichPrediction({
        userId: user.id,
        predictionId,
        text,
        reasoning: input.reasoning || null,
      });
    } catch (error) {
      console.error("createPrediction: enrichment failed", error instanceof Error ? error.name : "UnknownError");
    }
  });

  // OUTSIDE the try: Next implements redirect() by throwing a special error —
  // catching it would swallow the navigation.
  redirect("/dashboard");
}
