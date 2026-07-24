import { describe, expect, it } from "vitest";
import { emailConfirmationMatches } from "./confirmEmail";

const EMAIL = "user@example.com";

describe("emailConfirmationMatches — the delete confirmation gate", () => {
  it("is false for an empty input (the default state — button disabled)", () => {
    expect(emailConfirmationMatches("", EMAIL)).toBe(false);
  });

  it("is false while the typed value is only a partial match", () => {
    expect(emailConfirmationMatches("user@example", EMAIL)).toBe(false);
    expect(emailConfirmationMatches("user@example.co", EMAIL)).toBe(false);
  });

  it("is false for a different address", () => {
    expect(emailConfirmationMatches("someone@else.com", EMAIL)).toBe(false);
  });

  it("is true for an exact match (button enables)", () => {
    expect(emailConfirmationMatches(EMAIL, EMAIL)).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(emailConfirmationMatches("  USER@Example.COM  ", EMAIL)).toBe(true);
  });

  it("never enables when there is no account email to match", () => {
    expect(emailConfirmationMatches("", "")).toBe(false);
    expect(emailConfirmationMatches("anything", "")).toBe(false);
  });
});
