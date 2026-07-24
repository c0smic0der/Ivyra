import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { HAIKU_INPUT_COST_PER_TOKEN, HAIKU_MODEL, HAIKU_OUTPUT_COST_PER_TOKEN } from "@/lib/ai/anthropic";
import {
  embeddingCostUsd,
  embedTextWithUsage,
  OPENAI_EMBEDDING_MODEL,
} from "@/lib/ai/embedding";
import { DAILY_AI_CALL_CAP, embedAndLog, enrichAndPersist, runEnrichWithRepair } from "@/lib/ai/enrichCore";

// DB-touching orchestration for capture-time enrichment. The pure/injectable
// logic (cap boundary check, repair-retry) lives in enrichCore.ts so it can
// be unit-tested without a DATABASE_URL or any network access.

export async function countAiCallsToday(userId: string): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.aiCalls)
    .where(and(eq(schema.aiCalls.userId, userId), gte(schema.aiCalls.createdAt, startOfDayUtc)));
  return result?.count ?? 0;
}

// Namespace for the per-user advisory lock below. Any constant works; it only
// has to be distinct from other pg_advisory_lock users in this app (there are
// none today) so the two-int lock key can never collide with an unrelated lock.
const AI_CAP_LOCK_NAMESPACE = 4207;

export type AiCallPurpose =
  | "enrich"
  | "enrich_embed"
  | "postmortem"
  | "scoped_insight"
  | "monthly_insight"
  | "reference_class"
  | "track_record_embed"
  | "backfill_embed";

function costFor(inputTokens: number, outputTokens: number): string {
  return (
    inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN
  ).toFixed(6);
}

export async function logAiCall(params: {
  userId: string;
  predictionId: string | null;
  purpose: AiCallPurpose;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  // Explicit cost override. Anthropic calls omit it (cost derives from Haiku
  // rates); embedding calls pass their OpenAI-derived cost, since the per-token
  // rate differs by ~50x and must not be computed from the Haiku assumption.
  costUsd?: string;
}): Promise<void> {
  await db.insert(schema.aiCalls).values({
    userId: params.userId,
    predictionId: params.predictionId,
    purpose: params.purpose,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: params.costUsd ?? costFor(params.inputTokens, params.outputTokens),
    latencyMs: params.latencyMs,
  });
}

/**
 * Atomically reserve a daily-cap slot: if the user is under the cap for today
 * (UTC), insert a 0-usage `ai_calls` row and return its id; otherwise return
 * null (over cap — the caller must skip the model call). `finalizeAiCall` fills
 * real usage once the call completes; `releaseAiCall` frees the slot if no call
 * actually happened.
 *
 * This is the SHARED cap gate every user-facing AI call site routes through, so
 * the fix lands once (capture enrichment, the track-record embed, the
 * post-mortem stream, and scoped-insight generation all inherit it).
 *
 * Why an advisory lock and not just a conditional INSERT: the count read and the
 * insert must be ONE indivisible step. A bare
 * `INSERT ... SELECT ... WHERE (SELECT count(*)) < cap` is NOT atomic under
 * Postgres READ COMMITTED — `count(*)` can't see other transactions' as-yet
 * uncommitted inserts, so N simultaneous requests at the boundary all read the
 * same sub-cap count and all insert, overrunning the cap by up to N. Taking a
 * transaction-scoped advisory lock keyed on the user serializes that user's
 * reservations, so each count reflects every committed slot — closing the
 * read-then-act TOCTOU the old `countAiCallsToday` + `isUnderDailyCap` + log
 * sequence left open (docs/TODO.md). The lock is released automatically at
 * COMMIT/ROLLBACK and is namespaced so it can't collide with any other lock.
 */
export async function reserveAiCallIfUnderCap(
  params: {
    userId: string;
    predictionId: string | null;
    purpose: AiCallPurpose;
    model: string;
  },
  cap: number = DAILY_AI_CALL_CAP,
): Promise<string | null> {
  // Start-of-day in UTC, computed exactly like countAiCallsToday so the atomic
  // gate and the read-only cap displays agree on the day boundary (the project's
  // UTC-everywhere date convention). Passed as an ISO string with an explicit
  // ::timestamptz cast, not a JS Date: a bare Date param doesn't serialize
  // through drizzle's raw `sql` execute path (unlike the typed query builder in
  // countAiCallsToday). The ISO string carries the `Z` offset, so it's the same
  // UTC instant either way.
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const startOfDayUtcIso = startOfDayUtc.toISOString();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${AI_CAP_LOCK_NAMESPACE}, hashtext(${params.userId}))`,
    );
    const rows = await tx.execute(sql`
      insert into ai_calls
        (user_id, prediction_id, purpose, model, input_tokens, output_tokens, cost_usd, latency_ms)
      select
        ${params.userId}::uuid, ${params.predictionId}::uuid, ${params.purpose}, ${params.model}, 0, 0, '0.000000', 0
      where (
        select count(*) from ai_calls
        where user_id = ${params.userId}::uuid and created_at >= ${startOfDayUtcIso}::timestamptz
      ) < ${cap}
      returning id
    `);
    const reserved = rows as unknown as Array<{ id: string }>;
    return reserved[0]?.id ?? null;
  });
}

/**
 * Fill a reserved ai_calls row with the real token counts, cost, and latency.
 * `costUsd` overrides the Haiku-rate default — embedding calls MUST pass their
 * own OpenAI-derived cost (the per-token rate differs ~50x; see logAiCall).
 *
 * The `userId` predicate is a STRUCTURAL tenant boundary, not a correctness
 * requirement of today's callers (each passes the id of the row it just reserved
 * under its own user). It makes a mismatched (id, userId) a no-op — zero rows
 * updated, never a cross-tenant write — so a future reuse in a bulk/admin path
 * that supplies an externally-sourced id can't silently mutate another user's
 * row. The safety lives in the query, not in caller discipline.
 */
export async function finalizeAiCall(
  id: string,
  userId: string,
  params: { inputTokens: number; outputTokens: number; latencyMs: number; costUsd?: string },
): Promise<void> {
  await db
    .update(schema.aiCalls)
    .set({
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd: params.costUsd ?? costFor(params.inputTokens, params.outputTokens),
      latencyMs: params.latencyMs,
    })
    .where(and(eq(schema.aiCalls.id, id), eq(schema.aiCalls.userId, userId)));
}

/**
 * Free a reserved slot when no billable call actually happened (e.g. an
 * embedding that returned null because no key is configured), so a reservation
 * that reserved-but-didn't-spend doesn't silently burn the user's daily cap.
 * Deleting the user's own just-inserted row is not a race — freeing capacity can
 * never push the count over the cap.
 *
 * The `userId` predicate is the same structural tenant boundary as
 * finalizeAiCall's: a mismatched (id, userId) deletes zero rows rather than
 * removing another user's ai_calls row.
 */
export async function releaseAiCall(id: string, userId: string): Promise<void> {
  await db.delete(schema.aiCalls).where(and(eq(schema.aiCalls.id, id), eq(schema.aiCalls.userId, userId)));
}

/**
 * Fired from actions.ts via after() — never blocks the initial row write.
 * Keeps only the daily-cap gate here; the degradation-critical tail (enrich →
 * log → embed → persist) lives in the DB-free, unit-tested `enrichAndPersist`,
 * to which this binds the real db/AI functions.
 */
export async function enrichPrediction(params: {
  userId: string;
  predictionId: string;
  text: string;
  reasoning: string | null;
}): Promise<void> {
  // Atomically reserve the enrich slot. Null => over cap: skip enrichment
  // gracefully; the row already saved and stays fully usable with
  // category/reasoningType/embedding left null. The reserved row is finalized
  // with real usage below (via logCall), even on enrich failure (0/0), so the
  // attempt always counts — matching the previous always-log behavior.
  const enrichCallId = await reserveAiCallIfUnderCap({
    userId: params.userId,
    predictionId: params.predictionId,
    purpose: "enrich",
    model: HAIKU_MODEL,
  });
  if (enrichCallId === null) return;

  await enrichAndPersist(params.text, params.reasoning, {
    runEnrich: runEnrichWithRepair,
    // Embedding is its own provider call (OpenAI) with its own cost, so it gets
    // its own ai_calls row via embedAndLog — logged only when a real vector
    // comes back (§9.7). Failures/nulls degrade to a null embedding column.
    embed: (text, reasoning) =>
      embedAndLog(text, reasoning, {
        embed: embedTextWithUsage,
        logCall: (usage) =>
          logAiCall({
            userId: params.userId,
            predictionId: params.predictionId,
            purpose: "enrich_embed",
            model: OPENAI_EMBEDDING_MODEL,
            costUsd: embeddingCostUsd(usage.inputTokens),
            ...usage,
          }),
      }),
    // The enrich slot is already reserved; fill it with real usage instead of
    // inserting a second row. The embedding (above) is a downstream OpenAI call
    // that rides this same reservation and logs its own row only on a real
    // vector — it is not separately cap-gated.
    logCall: (usage) => finalizeAiCall(enrichCallId, params.userId, usage),
    persist: (fields) =>
      db
        .update(schema.predictions)
        .set({
          category: fields.category,
          reasoningType: fields.reasoningType,
          embedding: fields.embedding,
        })
        .where(
          and(
            eq(schema.predictions.id, params.predictionId),
            eq(schema.predictions.userId, params.userId),
          ),
        )
        .then(() => undefined),
  });
}
