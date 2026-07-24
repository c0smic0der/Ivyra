"use server";

import { redirect } from "next/navigation";
import { emailConfirmationMatches } from "@/lib/account/confirmEmail";
import { deleteAllUserData } from "@/lib/account/deleteAccount";
import { createClient } from "@/lib/supabase/server";

export interface DeleteAccountState {
  formError?: string;
}

/**
 * Irreversibly deletes the signed-in user's account and all their data. Requires
 * the user to type their exact account email as confirmation — an un-guessable,
 * deliberate signal that destroys the right account (not a mistap). On success the
 * data + login are gone and the local session is cleared before redirecting home.
 */
export async function deleteAccount(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/?signin=1");
  }

  const confirmation = String(formData.get("confirmation") ?? "");
  // Same predicate the form's button-enable derives from, so the server never
  // accepts a confirmation the client would have rejected (or vice versa).
  if (!emailConfirmationMatches(confirmation, user.email ?? "")) {
    return { formError: "Type your account email exactly to confirm." };
  }

  try {
    await deleteAllUserData(user.id);
  } catch (error) {
    // Log the class name only — never the raw error, which can echo provider-side
    // detail (CLAUDE.md: identity/content never in logs). The user keeps their
    // account and can retry.
    const kind = error instanceof Error ? error.name : "UnknownError";
    console.error("account deletion failed", kind);
    return {
      formError:
        "Something went wrong deleting your account. Please try again — a retry is safe — and email demouser4132+privacy@gmail.com if it persists.",
    };
  }

  // The auth user is gone; clear the local session cookies too. Best-effort — the
  // server-side session is already invalid, so a failure here is harmless.
  await supabase.auth.signOut().catch(() => {});
  redirect("/?deleted=1");
}
