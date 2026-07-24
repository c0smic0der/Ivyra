import { config } from "dotenv";
// Load .env.local so this runs locally against the real DB; without DATABASE_URL
// (e.g. CI with no database) the suite below skips, matching the opt-in-live
// convention in aiCallTenant.integration.test.ts. Account deletion is a real
// multi-table Postgres delete filtered by user_id — a pure test can't prove the
// rows actually clear or that one user's deletion spares another's, so this
// seeds two users across every user-scoped table and asserts both properties.
config({ path: ".env.local" });

import { afterAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

(hasDb ? describe : describe.skip)("deleteAllUserData — clears all tables, spares other users (integration)", () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();

  // Imported dynamically: @/db and deleteAccount.ts read DATABASE_URL at module
  // load, so they must not be imported when the suite is skipped.
  async function deps() {
    const { db, schema } = await import("@/db");
    const account = await import("./deleteAccount");
    const { eq } = await import("drizzle-orm");
    return { db, schema, eq, ...account };
  }

  /** Seeds one row in EVERY user-scoped table for a user. */
  async function seed(userId: string) {
    const { db, schema } = await deps();
    await db.insert(schema.predictions).values({
      userId,
      text: "integration-test prediction",
      predictionKind: "self",
      confidence: "0.7",
      resolutionDate: "2030-01-01",
    });
    await db.insert(schema.aiCalls).values({
      userId,
      purpose: "scoped_insight",
      model: "test-model",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: "0.000001",
      latencyMs: 1,
    });
    await db.insert(schema.insights).values({
      userId,
      scope: "lifetime",
      nResolvedAtGeneration: 0,
      bodyText: "integration-test insight",
    });
    await db.insert(schema.userStats).values({ userId, nResolved: 0 });
  }

  /** Row count for a user in each user-scoped table, keyed by table name. */
  async function rowCounts(userId: string): Promise<Record<string, number>> {
    const { db, eq, USER_SCOPED_TABLES } = await deps();
    const out: Record<string, number> = {};
    for (const { name, table, userIdColumn } of USER_SCOPED_TABLES) {
      const rows = await db.select({ id: userIdColumn }).from(table).where(eq(userIdColumn, userId));
      out[name] = rows.length;
    }
    return out;
  }

  afterAll(async () => {
    // Remove whatever survived, whatever the assertions did (userA should be gone
    // already; this cleans up userB and any partial state).
    const { db, schema, eq } = await deps();
    const { or } = await import("drizzle-orm");
    for (const table of [schema.predictions, schema.aiCalls, schema.insights, schema.userStats]) {
      await db.delete(table).where(or(eq(table.userId, userA), eq(table.userId, userB)));
    }
  });

  it("deletes every user-scoped row for the target user and no other user's rows", async () => {
    const { deleteAllUserData, USER_SCOPED_TABLES } = await deps();
    await seed(userA);
    await seed(userB);

    // Sanity: both users have exactly one row in every table before deletion.
    const before = await rowCounts(userA);
    for (const { name } of USER_SCOPED_TABLES) expect(before[name]).toBe(1);

    // Stub the auth-user delete — these test users have no auth.users row.
    let authDeletedFor: string | null = null;
    const result = await deleteAllUserData(userA, {
      deleteAuthUser: async (id) => {
        authDeletedFor = id;
      },
    });

    // Every user-scoped table for userA is empty; the return counts say so too.
    const afterA = await rowCounts(userA);
    for (const { name } of USER_SCOPED_TABLES) {
      expect(afterA[name]).toBe(0);
      expect(result.rowsDeleted[name]).toBe(1);
    }
    expect(result.authUserDeleted).toBe(true);
    expect(authDeletedFor).toBe(userA);

    // userB is entirely untouched — one row still in every table.
    const afterB = await rowCounts(userB);
    for (const { name } of USER_SCOPED_TABLES) expect(afterB[name]).toBe(1);
  });
});
