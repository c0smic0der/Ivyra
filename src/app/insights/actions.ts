"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { HAIKU_MODEL } from "@/lib/ai/anthropic";
import { finalizeAiCall, reserveAiCallIfUnderCap } from "@/lib/ai/enrich";
import { isValidScope, runInsightWithRepair, runScopedInsight } from "@/lib/ai/scopedInsightCore";
import { buildScopeStats, type InsightPrediction } from "@/lib/insights/scopedInsightView";
import { createClient } from "@/lib/supabase/server";

export type GenerateInsightResult =
  | { ok: true; bodyText: string }
  | {
      ok: false;
      error: "unauthorized" | "invalid_scope" | "insufficient_data" | "over_cap" | "ai_failed" | "unexpected";
    };

/**
 * Generate (or regenerate) the scoped AI insight for one scope, on demand. This
 * is the ONLY path that spends a Haiku call for the insight — never a cron, never
 * a page load. Deterministic guards run first (auth → valid scope → enough data →
 * under the daily cap); only then does one Haiku call run, get logged to
 * ai_calls, and its result cached in the insights table keyed by (user, scope).
 *
 * On any AI failure the row is left untouched and `ai_failed` is returned, so the
 * page keeps rendering the templated fallback — the insights page never breaks
 * because the model is down.
 */
export async function generateInsight(input: { scope: string }): Promise<GenerateInsightResult> {
  // Accepts "recent", "lifetime", or "category:<known-category>". An unknown
  // scope string can't index a real slice, so reject before touching the DB.
  if (!isValidScope(input.scope)) return { ok: false, error: "invalid_scope" };
  const scope = input.scope;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  try {
    // Same RLS-guarded read the page uses: the user's full resolved/void history,
    // chronological, so the Recent window is the true trailing slice. Includes the
    // frozen text the insight's behavioral half reasons over (reasoning, note).
    const rows = await db
      .select({
        confidence: schema.predictions.confidence,
        outcome: schema.predictions.outcome,
        status: schema.predictions.status,
        category: schema.predictions.category,
        reasoningType: schema.predictions.reasoningType,
        text: schema.predictions.text,
        reasoning: schema.predictions.reasoning,
        outcomeNote: schema.predictions.outcomeNote,
      })
      .from(schema.predictions)
      .where(
        and(
          eq(schema.predictions.userId, user.id),
          inArray(schema.predictions.status, ["resolved", "void"]),
        ),
      )
      .orderBy(asc(schema.predictions.resolvedAt));

    const preds: InsightPrediction[] = rows.map((r) => ({
      confidence: Number(r.confidence),
      outcome: r.outcome,
      status: r.status,
      category: r.category,
      reasoningType: r.reasoningType,
      text: r.text,
      reasoning: r.reasoning,
      outcomeNote: r.outcomeNote,
    }));

    const stats = buildScopeStats(preds, scope);
    // Never spend a call on a scope too thin to profile — the code decides this,
    // and the UI already hides the action, but guard the action too.
    if (stats.profile === "insufficient_data") return { ok: false, error: "insufficient_data" };

    // Daily cap gate — atomic. Null => over cap: no call, honest error; the page
    // still shows the cached insight (if any) and the fallback. Reserving here
    // (rather than counting-then-logging) is what makes "Regenerate" un-abusable:
    // every re-click / scope-cycle must win an atomic slot, so rapid-fire clicks
    // can reserve at most (cap - used) slots total, never overrun.
    const callId = await reserveAiCallIfUnderCap({
      userId: user.id,
      predictionId: null,
      purpose: "scoped_insight",
      model: HAIKU_MODEL,
    });
    if (callId === null) return { ok: false, error: "over_cap" };

    const result = await runScopedInsight(stats, {
      runInsight: (prompt) => runInsightWithRepair(prompt),
      persist: (bodyText, nResolvedAtGeneration, promptVersion, statsJson) =>
        db
          .insert(schema.insights)
          .values({
            userId: user.id,
            scope,
            nResolvedAtGeneration,
            promptVersion,
            bodyText,
            statsJson,
          })
          .onConflictDoUpdate({
            target: [schema.insights.userId, schema.insights.scope],
            set: { bodyText, nResolvedAtGeneration, promptVersion, statsJson, createdAt: new Date() },
          })
          .then(() => undefined),
      // Fill the reserved slot with real usage. runScopedInsight always calls
      // this (0/0 on a thrown call, real tokens otherwise), so a failed insight
      // still counts as a spent attempt — same "always counted" contract as
      // enrichment, and the reason a failing regen can't be looped for free.
      logCall: (usage) => finalizeAiCall(callId, user.id, usage),
    });

    if (!result.ok || result.bodyText === null) return { ok: false, error: "ai_failed" };

    // Re-render the server component so the freshly cached text flows down.
    revalidatePath("/insights");
    return { ok: true, bodyText: result.bodyText };
  } catch (error) {
    console.error("generateInsight: failed", error instanceof Error ? error.name : "UnknownError");
    return { ok: false, error: "unexpected" };
  }
}
