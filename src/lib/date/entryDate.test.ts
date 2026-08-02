import { describe, expect, it } from "vitest";
import { formatEntryDate } from "./entryDate";

describe("formatEntryDate — renders in the user's local timezone, never UTC", () => {
  // 11:30pm EDT on the 28th is 03:30Z on the 29th. A New York journaler writing
  // at night must see the 28th — the day it is where they are.
  const lateNightNY = new Date("2026-07-28T23:30:00-04:00");

  it("keeps a late-night NY entry on the same local calendar day", () => {
    expect(formatEntryDate(lateNightNY, "America/New_York")).toBe("28 July");
  });

  it("confirms the bug it guards against: a UTC render of the same instant rolls to the 29th", () => {
    expect(formatEntryDate(lateNightNY, "UTC")).toBe("29 July");
  });
});
