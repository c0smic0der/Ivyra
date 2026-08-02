import { config } from "dotenv";
// Load .env.local so this runs locally against the real DB; without DATABASE_URL
// (e.g. CI with no database) the suite below skips, matching the opt-in-live
// convention in aiCallTenant.integration.test.ts and insightEval.test.ts.
//
// The user scoping in findSimilarResolvedPredictions is a real Postgres
// `where user_id = …` on a pgvector similarity search — the privileged
// DATABASE_URL bypasses RLS, so that filter is the ONLY thing between one user's
// track record and another's. A pure test can't prove it; this inserts two
// users' resolved rows with the SAME embedding (so both would match on
// similarity alone) and asserts the query returns only the caller's rows.
config({ path: ".env.local" });

import { afterAll, describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai/embedding";

const hasDb = Boolean(process.env.DATABASE_URL);

(hasDb ? describe : describe.skip)("findSimilarResolvedPredictions — user scoping (integration)", () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();

  // A single shared vector: every inserted row is identical in embedding space,
  // so cosine similarity is ~1 for all and the ONLY thing that can exclude a row
  // is the user_id filter under test.
  const sharedVector = Array(EMBEDDING_DIMENSIONS).fill(0.05);

  async function deps() {
    const { db, schema } = await import("@/db");
    const { eq, or } = await import("drizzle-orm");
    const { findSimilarResolvedPredictions } = await import("@/lib/trackRecord/query");
    return { db, schema, eq, or, findSimilarResolvedPredictions };
  }

  async function insertResolved(userId: string, text: string) {
    const { db, schema } = await deps();
    await db.insert(schema.predictions).values({
      userId,
      text,
      predictionKind: "self",
      confidence: "0.8",
      resolutionDate: "2026-01-01",
      status: "resolved",
      outcome: true,
      embedding: sharedVector,
      resolvedAt: new Date(),
    });
  }

  afterAll(async () => {
    const { db, schema, eq, or } = await deps();
    await db
      .delete(schema.predictions)
      .where(or(eq(schema.predictions.userId, userA), eq(schema.predictions.userId, userB)));
  });

  it("returns only the caller's own resolved rows, never another user's", async () => {
    await insertResolved(userA, "A-1 ship the redesign by the 15th");
    await insertResolved(userA, "A-2 finish the migration this quarter");
    await insertResolved(userB, "B-1 SECRET the deal closes by Friday");
    await insertResolved(userB, "B-2 SECRET they come back with a better offer");

    const { findSimilarResolvedPredictions } = await deps();
    const forA = await findSimilarResolvedPredictions(userA, sharedVector);

    // A sees exactly A's two rows.
    expect(forA).toHaveLength(2);
    expect(forA.every((r) => r.text.startsWith("A-"))).toBe(true);
    // And never any of B's, even though they match on similarity identically.
    expect(forA.some((r) => r.text.includes("SECRET"))).toBe(false);

    // Symmetric: B sees only B's rows.
    const forB = await findSimilarResolvedPredictions(userB, sharedVector);
    expect(forB).toHaveLength(2);
    expect(forB.every((r) => r.text.startsWith("B-"))).toBe(true);
  });

  it("returns nothing for a user with no resolved rows at all", async () => {
    const stranger = crypto.randomUUID();
    const { findSimilarResolvedPredictions } = await deps();
    expect(await findSimilarResolvedPredictions(stranger, sharedVector)).toEqual([]);
  });
});
