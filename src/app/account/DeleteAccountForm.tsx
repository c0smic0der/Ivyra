"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type DeleteAccountState } from "./actions";
import { emailConfirmationMatches } from "@/lib/account/confirmEmail";
import { inputClasses } from "@/components/ui/input";
import { cx } from "@/components/ui/cx";

const initialState: DeleteAccountState = {};

/**
 * Danger-zone form. The delete button stays disabled until the typed value
 * exactly matches the account email — a client-side guard mirroring the server
 * check, so an accidental click can't fire. The server re-validates regardless.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);
  const [confirmation, setConfirmation] = useState("");

  const matches = emailConfirmationMatches(confirmation, email);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-3">
      <label htmlFor="confirmation" className="text-sm text-ink-secondary">
        Type <span className="font-medium text-ink">{email}</span> below to confirm.
      </label>
      <input
        id="confirmation"
        name="confirmation"
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={email}
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        className={inputClasses()}
      />
      <button
        type="submit"
        disabled={pending || !matches}
        className={cx(
          "inline-flex items-center justify-center rounded-xl bg-danger px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {pending ? "Deleting…" : "Permanently delete my account"}
      </button>
      {state.formError && <p className="text-sm text-danger">{state.formError}</p>}
    </form>
  );
}
