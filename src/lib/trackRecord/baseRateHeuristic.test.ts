import { describe, expect, it } from "vitest";
import { matchBaseRateKind } from "@/lib/trackRecord/baseRateHeuristic";

describe("matchBaseRateKind — fallback selection", () => {
  it("matches a deadline prediction (rundown example)", () => {
    expect(matchBaseRateKind("The kitchen reno finishes by Aug 15")).toBe("deadline_hit");
  });

  it("matches a habit prediction (rundown example)", () => {
    expect(matchBaseRateKind("I go to the gym 12+ times in March")).toBe("habit_adherence");
  });

  it("matches a deadline prediction phrased with 'before' (rundown example)", () => {
    expect(matchBaseRateKind("Our team ships the redesign before the end of the quarter")).toBe(
      "deadline_hit",
    );
  });

  it("matches a hiring prediction", () => {
    expect(matchBaseRateKind("The new hire works out within 90 days")).toBe("hiring_works_out");
  });

  it("matches a budget prediction", () => {
    expect(matchBaseRateKind("The project finishes under budget")).toBe("project_on_budget");
  });

  it("prefers the more specific hiring match over an incidental 'by'", () => {
    expect(matchBaseRateKind("We hire a new engineer by June")).toBe("hiring_works_out");
  });

  it("returns null when nothing matches", () => {
    expect(matchBaseRateKind("It will rain tomorrow")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(matchBaseRateKind("HIRING a candidate for the role")).toBe("hiring_works_out");
  });
});
