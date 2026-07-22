import { describe, expect, it } from "vitest";
import {
  dueDateString,
  groupDueByUser,
  isAuthorized,
  notYetReminded,
  type DuePrediction,
} from "@/lib/reminders/remindersCore";

describe("isAuthorized — cron bearer-secret check (pure)", () => {
  it("passes with the exact expected header", () => {
    expect(isAuthorized("Bearer topsecret", "topsecret")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isAuthorized("Bearer wrong", "topsecret")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isAuthorized(null, "topsecret")).toBe(false);
  });

  it("rejects a header missing the Bearer scheme", () => {
    expect(isAuthorized("topsecret", "topsecret")).toBe(false);
  });

  it("rejects when CRON_SECRET is unset", () => {
    expect(isAuthorized("Bearer topsecret", undefined)).toBe(false);
  });

  it("rejects when CRON_SECRET is empty, even against an empty header", () => {
    expect(isAuthorized("Bearer ", "")).toBe(false);
  });
});

describe("dueDateString — UTC calendar date (pure)", () => {
  it("returns the UTC date for a mid-day timestamp", () => {
    expect(dueDateString(new Date("2026-07-22T13:00:00.000Z"))).toBe("2026-07-22");
  });

  it("does not roll over just before UTC midnight", () => {
    expect(dueDateString(new Date("2026-07-22T23:59:00.000Z"))).toBe("2026-07-22");
  });

  it("rolls over just after UTC midnight", () => {
    expect(dueDateString(new Date("2026-07-23T00:01:00.000Z"))).toBe("2026-07-23");
  });
});

describe("notYetReminded — idempotency filter (pure)", () => {
  const row = (id: string, remindedAt: string | null): DuePrediction => ({
    id,
    userId: "user-a",
    text: `prediction ${id}`,
    remindedAt,
  });

  it("keeps rows that have never been reminded", () => {
    const rows = [row("p1", null), row("p2", null)];
    expect(notYetReminded(rows)).toEqual(rows);
  });

  it("drops rows already reminded, so a second run in the same window sends nothing", () => {
    const firstRun = [row("p1", null), row("p2", null)];
    // Simulate the route marking both rows reminded after a successful send,
    // then invoking the route again in the same window.
    const secondRun = firstRun.map((r) => ({ ...r, remindedAt: "2026-07-22T13:00:00.000Z" }));
    expect(notYetReminded(secondRun)).toEqual([]);
  });

  it("only drops the specific rows already reminded, in a mixed batch", () => {
    const rows = [row("p1", "2026-07-22T13:00:00.000Z"), row("p2", null)];
    expect(notYetReminded(rows)).toEqual([row("p2", null)]);
  });
});

describe("groupDueByUser — pure grouping", () => {
  const row = (id: string, userId: string): DuePrediction => ({
    id,
    userId,
    text: `prediction ${id}`,
    remindedAt: null,
  });

  it("returns an empty map for no rows", () => {
    expect(groupDueByUser([])).toEqual(new Map());
  });

  it("collapses multiple predictions for one user into one entry", () => {
    const rows = [row("p1", "user-a"), row("p2", "user-a")];
    const grouped = groupDueByUser(rows);
    expect(grouped.size).toBe(1);
    expect(grouped.get("user-a")).toEqual(rows);
  });

  it("keeps predictions across different users separate", () => {
    const rows = [row("p1", "user-a"), row("p2", "user-b")];
    const grouped = groupDueByUser(rows);
    expect(grouped.size).toBe(2);
    expect(grouped.get("user-a")).toEqual([row("p1", "user-a")]);
    expect(grouped.get("user-b")).toEqual([row("p2", "user-b")]);
  });
});
