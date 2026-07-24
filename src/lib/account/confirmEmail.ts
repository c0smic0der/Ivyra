/**
 * True iff the typed confirmation matches the account email — trimmed and
 * case-insensitive (email addresses aren't case-sensitive, and a stray space
 * shouldn't block a genuine confirmation).
 *
 * The delete button's enabled state (DeleteAccountForm) AND the server action's
 * validation (deleteAccount) BOTH derive from this one predicate, so the client
 * gate and the server gate can never silently diverge (CLAUDE.md: when two code
 * paths must agree on a value, one derives from the other).
 */
export function emailConfirmationMatches(typed: string, email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  // No account email to match against → never enable deletion.
  if (!normalizedEmail) return false;
  return typed.trim().toLowerCase() === normalizedEmail;
}
