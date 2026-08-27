import { config } from "dotenv";
// Load .env.local so this runs locally against the real DB; without DATABASE_URL
// (e.g. CI with no database) the suite below skips, matching the opt-in-live
// convention in the other *.integration.test.ts files. This exercises the REAL
// createPrediction Server Action end to end — the pairing logic (deriveDecisionAndText)
// is unit-tested in isolation, but only a real insert proves the decision/text/
// prediction_kind columns land correctly together, and that a rejected save writes
// nothing at all.
config({ path: ".env.local" });

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

// Hoisted so the mock factories (which run before imports) can reference them —
// same pattern as src/lib/auth/requireUser.test.ts.
const { getUser, redirectMock, afterMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  // Real redirect() throws to halt execution; mirror that so a successful save is
  // asserted by catching the throw, and it can never fall through to code that
  // assumes rendering continues.
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  // next/server's after() is Next-runtime-only (requires a request scope). No-op it
  // so enrichPrediction/AI is never invoked here — this test proves persistence, not
  // background enrichment.
  afterMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/server", () => ({ after: afterMock }));

(hasDb ? describe : describe.skip)("createPrediction — decision/text split (integration)", () => {
  const userId = crypto.randomUUID();

  // Imported dynamically: @/db reads DATABASE_URL at module load, so it must not
  // be imported when the suite is skipped.
  async function deps() {
    const { db, schema } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    const { createPrediction } = await import("./actions");
    return { db, schema, and, eq, createPrediction };
  }

  // Mirrors what a real submit sends: reasoning/planOrDisconfirm are present-but-empty
  // (the textareas are always in the DOM), never absent — proving an above-fold-only
  // save succeeds means proving EMPTY optional fields validate, not omitted ones.
  function fields(overrides: Record<string, string>): FormData {
    const fd = new FormData();
    const base = {
      confidencePercent: "65",
      resolutionDate: "2030-01-01",
      reasoning: "",
      planOrDisconfirm: "",
    };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
    return fd;
  }

  afterEach(() => {
    getUser.mockReset();
    redirectMock.mockClear();
    afterMock.mockClear();
  });

  afterAll(async () => {
    const { db, schema, eq } = await deps();
    await db.delete(schema.predictions).where(eq(schema.predictions.userId, userId));
  });

  it("persists the first field to decision and the second to text, above-fold-only, forcing kind 'self'", async () => {
    const { createPrediction, db, schema, and, eq } = await deps();
    getUser.mockResolvedValue({ data: { user: { id: userId } } });

    const fd = fields({
      decision: "integration decision text",
      criterion: "integration criterion text",
    });

    await expect(createPrediction({}, fd)).rejects.toThrow("REDIRECT:/dashboard");

    const [row] = await db
      .select()
      .from(schema.predictions)
      .where(and(eq(schema.predictions.userId, userId), eq(schema.predictions.text, "integration criterion text")));
    expect(row.decision).toBe("integration decision text");
    expect(row.text).toBe("integration criterion text");
    expect(row.predictionKind).toBe("self");
  });

  it("rejects an empty criterion and writes no row — no code path can produce a partial or decision-null row", async () => {
    const { createPrediction, db, schema, and, eq } = await deps();
    getUser.mockResolvedValue({ data: { user: { id: userId } } });

    const fd = fields({
      decision: "integration rejected decision",
      criterion: "",
    });

    const result = await createPrediction({}, fd);
    expect(result.fieldErrors?.criterion).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();

    const rows = await db
      .select()
      .from(schema.predictions)
      .where(
        and(eq(schema.predictions.userId, userId), eq(schema.predictions.decision, "integration rejected decision")),
      );
    expect(rows).toHaveLength(0);
  });
});
