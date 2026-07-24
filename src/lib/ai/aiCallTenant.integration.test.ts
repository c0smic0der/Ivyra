import { config } from "dotenv";
// Load .env.local so this runs locally against the real DB; without DATABASE_URL
// (e.g. CI with no database) the suite below skips, matching the opt-in-live
// convention in insightEval.test.ts. This is the ONLY DB-touching test — the
// tenant boundary in finalizeAiCall/releaseAiCall is a real Postgres row-match,
// so a pure test couldn't prove it; this inserts two users' rows and asserts a
// cross-user id can neither finalize nor delete the other user's row.
config({ path: ".env.local" });

import { afterAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

(hasDb ? describe : describe.skip)("finalizeAiCall / releaseAiCall — tenant boundary (integration)", () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();

  // Imported dynamically: `@/db` reads DATABASE_URL at module load, so it must
  // not be imported when the suite is skipped.
  async function deps() {
    const { db, schema } = await import("@/db");
    const enrich = await import("@/lib/ai/enrich");
    const { eq } = await import("drizzle-orm");
    return { db, schema, eq, ...enrich };
  }

  async function reserve(userId: string) {
    const { reserveAiCallIfUnderCap } = await deps();
    const id = await reserveAiCallIfUnderCap({
      userId,
      predictionId: null,
      purpose: "scoped_insight",
      model: "test-model",
    });
    if (!id) throw new Error("reservation unexpectedly over cap for a fresh test user");
    return id;
  }

  async function readRow(id: string) {
    const { db, schema, eq } = await deps();
    const [row] = await db.select().from(schema.aiCalls).where(eq(schema.aiCalls.id, id));
    return row ?? null;
  }

  afterAll(async () => {
    // Remove every row these test users created, whatever the assertions did.
    const { db, schema, eq } = await deps();
    const { or } = await import("drizzle-orm");
    await db
      .delete(schema.aiCalls)
      .where(or(eq(schema.aiCalls.userId, userA), eq(schema.aiCalls.userId, userB)));
  });

  it("a different user's id cannot FINALIZE another user's reserved row (no-op)", async () => {
    const { finalizeAiCall } = await deps();
    const idA = await reserve(userA);

    // userB tries to finalize userA's row — must touch zero rows.
    await finalizeAiCall(idA, userB, { inputTokens: 999, outputTokens: 999, latencyMs: 999 });
    const afterForeign = await readRow(idA);
    expect(afterForeign).not.toBeNull();
    expect(afterForeign!.inputTokens).toBe(0); // still the reserved 0/0 — untouched
    expect(afterForeign!.outputTokens).toBe(0);

    // The rightful owner CAN finalize it.
    await finalizeAiCall(idA, userA, { inputTokens: 12, outputTokens: 34, latencyMs: 56 });
    const afterOwner = await readRow(idA);
    expect(afterOwner!.inputTokens).toBe(12);
    expect(afterOwner!.outputTokens).toBe(34);
  });

  it("a different user's id cannot RELEASE (delete) another user's reserved row (no-op)", async () => {
    const { releaseAiCall } = await deps();
    const idA = await reserve(userA);

    // userB tries to release userA's row — must delete zero rows.
    await releaseAiCall(idA, userB);
    expect(await readRow(idA)).not.toBeNull();

    // The rightful owner CAN release it.
    await releaseAiCall(idA, userA);
    expect(await readRow(idA)).toBeNull();
  });
});
