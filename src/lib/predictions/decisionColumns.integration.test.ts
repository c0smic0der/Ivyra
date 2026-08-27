import { config } from "dotenv";
// Load .env.local so this runs locally against the real DB; without DATABASE_URL
// (e.g. CI with no database) the suite below skips, matching the opt-in-live
// convention in the other *.integration.test.ts files. The decision-layer
// columns (decision/stance/reflection) are nullable and un-backfilled, so a
// pure test can't prove existing rows read back null with kinds unchanged, or
// that a decision-set insert persists kind 'self' — this asserts both on the DB.
config({ path: ".env.local" });

import { afterAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

(hasDb ? describe : describe.skip)("predictions decision-layer columns (integration)", () => {
  const userId = crypto.randomUUID();

  // Imported dynamically: @/db reads DATABASE_URL at module load, so it must not
  // be imported when the suite is skipped.
  async function deps() {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { kindFor } = await import("./kind");
    return { db, schema, eq, kindFor };
  }

  afterAll(async () => {
    const { db, schema, eq } = await deps();
    await db.delete(schema.predictions).where(eq(schema.predictions.userId, userId));
  });

  it("reads back a forecast row with all three decision-layer columns null and kind unchanged", async () => {
    const { db, schema } = await deps();
    const [row] = await db
      .insert(schema.predictions)
      .values({
        userId,
        text: "integration forecast row",
        predictionKind: "world",
        confidence: "0.6",
        resolutionDate: "2030-01-01",
      })
      .returning();

    expect(row.decision).toBeNull();
    expect(row.stance).toBeNull();
    expect(row.reflection).toBeNull();
    expect(row.predictionKind).toBe("world");
  });

  it("persists prediction_kind 'self' for a decision-set insert and round-trips the columns", async () => {
    const { db, schema, kindFor } = await deps();
    const [row] = await db
      .insert(schema.predictions)
      .values({
        userId,
        text: "integration decision row",
        // Derived through kindFor — the write path, never inline. A decision
        // forces 'self' even though the caller offered 'world'.
        predictionKind: kindFor({ decision: "turned down the contract", predictionKind: "world" }),
        decision: "turned down the contract",
        stance: "stand_by",
        reflection: "still the read I'd make",
        confidence: "0.7",
        resolutionDate: "2030-01-01",
      })
      .returning();

    expect(row.predictionKind).toBe("self");
    expect(row.decision).toBe("turned down the contract");
    expect(row.stance).toBe("stand_by");
    expect(row.reflection).toBe("still the read I'd make");
  });
});
