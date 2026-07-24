import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form imports the deleteAccount server action, which transitively pulls in
// the DB client (throws at import without DATABASE_URL). The action only fires on
// submit — never during the static render we test — so stub the module to keep
// the import graph DB-free (mirrors ResolutionHistory.test.tsx).
vi.mock("./actions", () => ({ deleteAccount: async () => ({}) }));

import { DeleteAccountForm } from "./DeleteAccountForm";

describe("DeleteAccountForm — confirmation gate", () => {
  it("renders the delete button disabled in its initial (empty) state", () => {
    const html = renderToStaticMarkup(<DeleteAccountForm email="user@example.com" />);

    // The only interactive control that gates on the typed email is the submit
    // button; with an empty input it must render disabled.
    expect(html).toMatch(/<button[^>]*\bdisabled\b/);
    expect(html).toContain("Permanently delete my account");
  });
});
