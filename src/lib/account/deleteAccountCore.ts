// Deliberately DB-free: pure orchestration of an account deletion, mirroring the
// enrichCore/enrich split. Everything that touches Postgres or Supabase lives in
// deleteAccount.ts and is passed in here as `deps`, so this is unit-testable with
// zero network and no DATABASE_URL.

/** Rows removed per user-scoped table, keyed by table name. */
export type RowsDeleted = Record<string, number>;

export interface AccountDeletionDeps {
  /** Removes every application row for the user; returns per-table counts. */
  deleteUserRows: (userId: string) => Promise<RowsDeleted>;
  /** Removes the user's auth login. */
  deleteAuthUser: (userId: string) => Promise<void>;
}

export interface AccountDeletionResult {
  rowsDeleted: RowsDeleted;
  authUserDeleted: boolean;
}

/**
 * Irreversibly deletes a user: all application rows FIRST, then the auth login.
 * The order is load-bearing — if the auth-delete throws, the data is already gone
 * and the login remains, which is recoverable (a retry deletes zero rows, then
 * removes the login). The reverse order could strand inaccessible data under a
 * login that no longer exists. A failure in `deleteUserRows` propagates BEFORE
 * `deleteAuthUser` is ever called, so we never half-delete.
 *
 * Logs only a non-identifying marker — no user id, email, or prediction content
 * (CLAUDE.md: identity never in logs).
 */
export async function runAccountDeletion(
  userId: string,
  deps: AccountDeletionDeps,
): Promise<AccountDeletionResult> {
  const rowsDeleted = await deps.deleteUserRows(userId);
  await deps.deleteAuthUser(userId);

  const totalRows = Object.values(rowsDeleted).reduce((sum, n) => sum + n, 0);
  console.log("account_deletion_completed", {
    tablesCleared: Object.keys(rowsDeleted).length,
    rowsDeleted: totalRows,
  });

  return { rowsDeleted, authUserDeleted: true };
}
