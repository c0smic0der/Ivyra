import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted so the mock factories (which run before imports) can reference them.
const { getUser, redirectMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  // Real redirect() throws to halt rendering; mirror that so callers can't fall
  // through to code that assumes a user.
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { requireUser } from "./requireUser";

afterEach(() => {
  getUser.mockReset();
  redirectMock.mockClear();
});

describe("requireUser — page auth guard", () => {
  it("redirects an unauthenticated visitor to the sign-in landing", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireUser()).rejects.toThrow("REDIRECT:/?signin=1");
    expect(redirectMock).toHaveBeenCalledWith("/?signin=1");
  });

  it("returns the user and does not redirect when authenticated", async () => {
    const user = { id: "u1", email: "user@example.com" };
    getUser.mockResolvedValue({ data: { user } });

    await expect(requireUser()).resolves.toBe(user);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
