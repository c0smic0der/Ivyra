import { config } from "dotenv";
// Load .env.local so this runs locally against the real DB; without DATABASE_URL
// (e.g. CI with no database) the suite below skips — the opt-in-live convention
// (aiCallTenant.integration.test.ts, insightEval.test.ts). The idempotency and
// the 'backfill_embed' purpose are real DB behaviours (row selection + isNull
// write guard + an ai_calls insert), so a pure test can't prove them.
//
// The embed is FAKED (a fixed deterministic vector), so this never calls OpenAI
// or spends money — it exercises the DB binding, not the provider.
config({ path: ".env.local" });

import { afterAll, describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS, type EmbedResult } from "@/lib/ai/embedding";

const hasDb = Boolean(process.env.DATABASE_URL);

(hasDb ? describe : describe.skip)("backfillMissingEmbeddings — DB idempotency + purpose (integration)", () => {
  const userId = crypto.randomUUID();
  const fakeVector = Array(EMBEDDING_DIMENSIONS).fill(0.03);
  const fakeEmbed = async (): Promise<EmbedResult> => ({ embedding: fakeVector, inputTokens: 9 });

  async function deps() {
    const { db, schema } = await import("@/db");
    const { eq, and, isNotNull } = await import("drizzle-orm");
    const { backfillMissingEmbeddings } = await import("@/lib/ai/backfill");
    return { db, schema, eq, and, isNotNull, backfillMissingEmbeddings };
  }

  async function insertSeededRow(text: string) {
    const { db, schema } = await deps();
    await db.insert(schema.predictions).values({
      userId,
      text,
      reasoning: "seeded reasoning",
      predictionKind: "self",
      confidence: "0.8",
      resolutionDate: "2026-01-01",
      status: "resolved",
      outcome: true,
      // embedding intentionally omitted → NULL, the backfill's selection target.
    });
  }

  async function counts() {
    const { db, schema, eq, and, isNotNull } = await deps();
    const embedded = await db
      .select({ id: schema.predictions.id })
      .from(schema.predictions)
      .where(and(eq(schema.predictions.userId, userId), isNotNull(schema.predictions.embedding)));
    const calls = await db
      .select({ purpose: schema.aiCalls.purpose })
      .from(schema.aiCalls)
      .where(eq(schema.aiCalls.userId, userId));
    return { embeddedRows: embedded.length, aiCalls: calls.map((c) => c.purpose) };
  }

  afterAll(async () => {
    const { db, schema, eq } = await deps();
    await db.delete(schema.aiCalls).where(eq(schema.aiCalls.userId, userId));
    await db.delete(schema.predictions).where(eq(schema.predictions.userId, userId));
  });

  it("populates embeddings for seeded rows and logs each as 'backfill_embed'", async () => {
    await insertSeededRow("seed row 1");
    await insertSeededRow("seed row 2");
    await insertSeededRow("seed row 3");

    const { backfillMissingEmbeddings } = await deps();
    const result = await backfillMissingEmbeddings({ userId, embed: fakeEmbed });

    expect(result).toMatchObject({ embedded: 3, failed: 0, total: 3 });

    const after = await counts();
    expect(after.embeddedRows).toBe(3);
    expect(after.aiCalls).toHaveLength(3);
    // Every logged call is a backfill, NOT a live-save enrich.
    expect(after.aiCalls.every((p) => p === "backfill_embed")).toBe(true);
    expect(after.aiCalls).not.toContain("enrich");
    expect(after.aiCalls).not.toContain("enrich_embed");
  });

  it("is idempotent: a second run re-embeds nothing and logs no new ai_calls", async () => {
    const before = await counts();

    const { backfillMissingEmbeddings } = await deps();
    const second = await backfillMissingEmbeddings({ userId, embed: fakeEmbed });

    // Nothing left with a null embedding → nothing selected, nothing done.
    expect(second).toMatchObject({ embedded: 0, failed: 0, total: 0 });

    const after = await counts();
    expect(after.embeddedRows).toBe(before.embeddedRows); // unchanged
    expect(after.aiCalls).toHaveLength(before.aiCalls.length); // no double-log
  });
});
