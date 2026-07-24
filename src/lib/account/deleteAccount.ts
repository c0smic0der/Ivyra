import { eq } from "drizzle-orm";
import { db as defaultDb, schema } from "@/db";
import {
  runAccountDeletion,
  type AccountDeletionResult,
  type RowsDeleted,
} from "./deleteAccountCore";

// The SINGLE source of truth for "which tables hold a user's data". Adding a new
// user-scoped table? Add it here — nothing else in the delete path enumerates
// tables, so account deletion stays complete by construction (CLAUDE.md: derive,
// don't duplicate). `base_rates` is global reference data and is deliberately
// absent. Ordered children-before-parents (an ai_calls row references a
// prediction) so the deletes hold even if a foreign key is added later.
export const USER_SCOPED_TABLES = [
  { name: "ai_calls", table: schema.aiCalls, userIdColumn: schema.aiCalls.userId },
  { name: "insights", table: schema.insights, userIdColumn: schema.insights.userId },
  { name: "user_stats", table: schema.userStats, userIdColumn: schema.userStats.userId },
  { name: "predictions", table: schema.predictions, userIdColumn: schema.predictions.userId },
] as const;

type Db = typeof defaultDb;

/**
 * Deletes every application row belonging to `userId`, across all user-scoped
 * tables, in ONE transaction — so a mid-way failure clears nothing rather than
 * leaving the user half-erased. Returns a per-table count of rows removed.
 *
 * Each delete is filtered on `user_id = userId`; that filter (this connects via
 * the direct Postgres role, so RLS does not apply) is what keeps one user's
 * deletion from touching another's rows. The integration test proves it.
 */
export async function deleteUserRows(userId: string, db: Db = defaultDb): Promise<RowsDeleted> {
  return db.transaction(async (tx) => {
    const counts: RowsDeleted = {};
    for (const { name, table, userIdColumn } of USER_SCOPED_TABLES) {
      const deleted = await tx
        .delete(table)
        .where(eq(userIdColumn, userId))
        .returning({ userId: userIdColumn });
      counts[name] = deleted.length;
    }
    return counts;
  });
}

export interface DeleteAllUserDataDeps {
  db?: Db;
  /** Injectable so the integration test can stub out the real Auth admin call. */
  deleteAuthUser?: (userId: string) => Promise<void>;
}

/**
 * Wires the real DB + Auth primitives into the pure deletion orchestration.
 * The Auth admin client (`@/lib/supabase/admin`, marked `server-only`) is imported
 * lazily and ONLY when no override is supplied — so the integration test, which
 * passes its own `deleteAuthUser`, never loads a server-only module under vitest.
 */
export function deleteAllUserData(
  userId: string,
  deps: DeleteAllUserDataDeps = {},
): Promise<AccountDeletionResult> {
  const deleteAuthUser =
    deps.deleteAuthUser ??
    (async (id: string) => {
      const { deleteAuthUser } = await import("@/lib/supabase/admin");
      await deleteAuthUser(id);
    });
  return runAccountDeletion(userId, {
    deleteUserRows: (id) => deleteUserRows(id, deps.db),
    deleteAuthUser,
  });
}
