import { config } from "dotenv";
// Load .env.local so this runs locally against the real DB; without DATABASE_URL
// (e.g. CI with no database) the suite below skips, matching the opt-in-live
// convention in the other *.integration.test.ts files. The decision layer's
// subjective fields (docs/06-decision-layer.md §2.2) are written in the SAME
// UPDATE statement as the verdict — only a real Postgres write can prove that
// statement is atomic (a constraint violation rolls back the whole row, not
// just the offending column) and that the DB's stance CHECK constraint agrees
// with the application-level gate.
config({ path: ".env.local" });

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

const { getUser, revalidatePathMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
// revalidatePath needs a live Next.js request scope this test harness doesn't
// provide — no-op it so the assertions below exercise persistence, not routing.
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

(hasDb ? describe : describe.skip)("resolvePrediction — decision-layer subjective fields (integration)", () => {
  const userId = crypto.randomUUID();

  // Imported dynamically: @/db and actions.ts read DATABASE_URL / import the
  // Drizzle client at module load, so they must not load when the suite skips.
  async function deps() {
    const { db, schema } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    const { resolvePrediction } = await import("./actions");
    return { db, schema, and, eq, resolvePrediction };
  }

  async function insertOpenRow(overrides: Record<string, unknown>) {
    const { db, schema } = await deps();
    const [row] = await db
      .insert(schema.predictions)
      .values({
        userId,
        text: "integration criterion",
        predictionKind: "self",
        confidence: "0.7",
        resolutionDate: "2030-01-01",
        status: "open",
        ...overrides,
      })
      .returning();
    return row;
  }

  afterEach(() => {
    getUser.mockReset();
    revalidatePathMock.mockClear();
  });

  afterAll(async () => {
    const { db, schema, eq } = await deps();
    await db.delete(schema.predictions).where(eq(schema.predictions.userId, userId));
  });

  it("persists verdict, note, reflection, and stance together for a decision entry", async () => {
    const { resolvePrediction, db, schema, and, eq } = await deps();
    getUser.mockResolvedValue({ data: { user: { id: userId } } });
    const row = await insertOpenRow({ decision: "turned down the contract" });

    const result = await resolvePrediction({
      id: row.id,
      choice: "yes",
      outcomeNote: "It closed a week early.",
      reflection: "Still the read I'd make.",
      stance: "stand_by",
    });

    expect(result.ok).toBe(true);
    const [persisted] = await db
      .select()
      .from(schema.predictions)
      .where(and(eq(schema.predictions.id, row.id), eq(schema.predictions.userId, userId)));
    expect(persisted.status).toBe("resolved");
    expect(persisted.outcomeNote).toBe("It closed a week early.");
    expect(persisted.reflection).toBe("Still the read I'd make.");
    expect(persisted.stance).toBe("stand_by");
  });

  it("ignores a client-sent reflection/stance for a legacy forecast row (decision null)", async () => {
    const { resolvePrediction, db, schema, and, eq } = await deps();
    getUser.mockResolvedValue({ data: { user: { id: userId } } });
    const row = await insertOpenRow({ decision: null });

    const result = await resolvePrediction({
      id: row.id,
      choice: "no",
      outcomeNote: "",
      reflection: "should never land",
      stance: "mixed",
    });

    expect(result.ok).toBe(true);
    const [persisted] = await db
      .select()
      .from(schema.predictions)
      .where(and(eq(schema.predictions.id, row.id), eq(schema.predictions.userId, userId)));
    expect(persisted.reflection).toBeNull();
    expect(persisted.stance).toBeNull();
  });

  it("rejects a stance outside the enum server-side and writes nothing at all", async () => {
    const { resolvePrediction, db, schema, and, eq } = await deps();
    getUser.mockResolvedValue({ data: { user: { id: userId } } });
    const row = await insertOpenRow({ decision: "turned down the contract" });

    const result = await resolvePrediction({
      id: row.id,
      choice: "yes",
      outcomeNote: "note",
      reflection: "reflection",
      // Cast bypasses the TS union — this is exactly what a raw client request
      // (not the typed UI) could send.
      stance: "bogus_value" as unknown as "stand_by",
    });

    expect(result).toEqual({ ok: false, error: "invalid_stance" });
    const [persisted] = await db
      .select()
      .from(schema.predictions)
      .where(and(eq(schema.predictions.id, row.id), eq(schema.predictions.userId, userId)));
    expect(persisted.status).toBe("open");
    expect(persisted.reflection).toBeNull();
    expect(persisted.stance).toBeNull();
  });

  it("is frozen after save — a second resolve attempt is rejected and cannot overwrite the reflection", async () => {
    const { resolvePrediction, db, schema, and, eq } = await deps();
    getUser.mockResolvedValue({ data: { user: { id: userId } } });
    const row = await insertOpenRow({ decision: "turned down the contract" });

    await resolvePrediction({
      id: row.id,
      choice: "yes",
      outcomeNote: "first note",
      reflection: "first reflection",
      stance: "stand_by",
    });

    // No edit path exists in the module at all — the only exported mutator is
    // resolvePrediction itself, and its own `status = 'open'` guard rejects a
    // row that's already resolved.
    const second = await resolvePrediction({
      id: row.id,
      choice: "no",
      outcomeNote: "second note",
      reflection: "second reflection",
      stance: "wouldnt_again",
    });

    expect(second).toEqual({ ok: false, error: "already_resolved" });
    const [persisted] = await db
      .select()
      .from(schema.predictions)
      .where(and(eq(schema.predictions.id, row.id), eq(schema.predictions.userId, userId)));
    expect(persisted.reflection).toBe("first reflection");
    expect(persisted.stance).toBe("stand_by");
    expect(persisted.outcomeNote).toBe("first note");
  });

  it("atomicity: a DB-level constraint violation on stance rolls back the ENTIRE update — no half-written row", async () => {
    // Bypasses the application-level gate entirely (a raw update, not
    // resolvePrediction) to prove the invariant holds at the database layer
    // too: verdict + note + reflection + stance are one statement, so a
    // constraint failure on any one of them leaves the row completely
    // untouched, never partially updated.
    const { db, schema, and, eq } = await deps();
    const row = await insertOpenRow({ decision: "turned down the contract" });

    await expect(
      db
        .update(schema.predictions)
        .set({
          status: "resolved",
          outcome: true,
          outcomeNote: "would-be note",
          brierScore: "0.09",
          reflection: "would-be reflection",
          stance: "bogus_value" as unknown as "stand_by",
          resolvedAt: new Date(),
        })
        .where(and(eq(schema.predictions.id, row.id), eq(schema.predictions.userId, userId))),
    ).rejects.toThrow();

    const [persisted] = await db
      .select()
      .from(schema.predictions)
      .where(and(eq(schema.predictions.id, row.id), eq(schema.predictions.userId, userId)));
    expect(persisted.status).toBe("open");
    expect(persisted.outcome).toBeNull();
    expect(persisted.outcomeNote).toBeNull();
    expect(persisted.brierScore).toBeNull();
    expect(persisted.reflection).toBeNull();
    expect(persisted.stance).toBeNull();
  });
});
