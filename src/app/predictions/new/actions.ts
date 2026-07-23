"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { db, schema } from "@/db";
import { enrichPrediction } from "@/lib/ai/enrich";
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
    redirect("/login");
  }

  const validated = validateCreatePredictionInput({
    text: formData.get("text"),
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
        text: input.text,
        reasoning: input.reasoning || null,
        planOrDisconfirm: input.planOrDisconfirm || null,
        predictionKind: input.predictionKind,
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
    await enrichPrediction({
      userId: user.id,
      predictionId,
      text: input.text,
      reasoning: input.reasoning || null,
    });
  });

  // OUTSIDE the try: Next implements redirect() by throwing a special error —
  // catching it would swallow the navigation.
  redirect("/dashboard");
}
