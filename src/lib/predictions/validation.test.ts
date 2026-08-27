import { describe, expect, it } from "vitest";
import {
  confidencePercentToDbString,
  validateCreatePredictionInput,
} from "@/lib/predictions/validation";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const validBase = {
  decision: "I turn down the contract",
  criterion: "They come back with a better offer by Friday",
  confidencePercent: 70,
  resolutionDate: tomorrow(),
};

describe("validateCreatePredictionInput — confidence bounds", () => {
  it("rejects 0", () => {
    const r = validateCreatePredictionInput({ ...validBase, confidencePercent: 0 });
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.confidencePercent).toBeTruthy();
  });

  it("accepts 1 (lower inclusive bound)", () => {
    const r = validateCreatePredictionInput({ ...validBase, confidencePercent: 1 });
    expect(r.success).toBe(true);
  });

  it("accepts 99 (upper inclusive bound)", () => {
    const r = validateCreatePredictionInput({ ...validBase, confidencePercent: 99 });
    expect(r.success).toBe(true);
  });

  it("rejects 100", () => {
    const r = validateCreatePredictionInput({ ...validBase, confidencePercent: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer", () => {
    const r = validateCreatePredictionInput({ ...validBase, confidencePercent: 50.5 });
    expect(r.success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    const r = validateCreatePredictionInput({ ...validBase, confidencePercent: "not-a-number" });
    expect(r.success).toBe(false);
  });
});

describe("validateCreatePredictionInput — resolution date can’t be in the past", () => {
  it("rejects yesterday", () => {
    const r = validateCreatePredictionInput({ ...validBase, resolutionDate: yesterday() });
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.resolutionDate).toBeTruthy();
  });

  it("accepts today (same-day predictions are allowed — product decision)", () => {
    const r = validateCreatePredictionInput({ ...validBase, resolutionDate: today() });
    expect(r.success).toBe(true);
  });

  it("accepts tomorrow", () => {
    const r = validateCreatePredictionInput({ ...validBase, resolutionDate: tomorrow() });
    expect(r.success).toBe(true);
  });

  it("accepts a date far in the future", () => {
    const r = validateCreatePredictionInput({ ...validBase, resolutionDate: "2099-01-01" });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed date string", () => {
    const r = validateCreatePredictionInput({ ...validBase, resolutionDate: "not-a-date" });
    expect(r.success).toBe(false);
  });
});

describe("validateCreatePredictionInput — decision, criterion, and optional reasoning fields", () => {
  it("rejects empty decision", () => {
    const r = validateCreatePredictionInput({ ...validBase, decision: "" });
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.decision).toBeTruthy();
  });

  it("rejects whitespace-only decision", () => {
    const r = validateCreatePredictionInput({ ...validBase, decision: "   " });
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.decision).toBeTruthy();
  });

  it("rejects decision over the max length", () => {
    const r = validateCreatePredictionInput({ ...validBase, decision: "a".repeat(2001) });
    expect(r.success).toBe(false);
  });

  it("rejects empty criterion", () => {
    const r = validateCreatePredictionInput({ ...validBase, criterion: "" });
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.criterion).toBeTruthy();
  });

  it("rejects whitespace-only criterion", () => {
    const r = validateCreatePredictionInput({ ...validBase, criterion: "   " });
    expect(r.success).toBe(false);
    expect(r.fieldErrors?.criterion).toBeTruthy();
  });

  it("rejects criterion over the max length", () => {
    const r = validateCreatePredictionInput({ ...validBase, criterion: "a".repeat(2001) });
    expect(r.success).toBe(false);
  });

  it("rejects each field independently — an invalid decision alone does not flag criterion, and vice versa", () => {
    const badDecision = validateCreatePredictionInput({ ...validBase, decision: "   " });
    expect(badDecision.fieldErrors?.decision).toBeTruthy();
    expect(badDecision.fieldErrors?.criterion).toBeFalsy();

    const badCriterion = validateCreatePredictionInput({ ...validBase, criterion: "   " });
    expect(badCriterion.fieldErrors?.criterion).toBeTruthy();
    expect(badCriterion.fieldErrors?.decision).toBeFalsy();
  });

  it("accepts reasoning and planOrDisconfirm omitted", () => {
    const r = validateCreatePredictionInput(validBase);
    expect(r.success).toBe(true);
  });

  it("accepts reasoning and planOrDisconfirm as empty strings", () => {
    const r = validateCreatePredictionInput({
      ...validBase,
      reasoning: "",
      planOrDisconfirm: "",
    });
    expect(r.success).toBe(true);
  });

  it("accepts reasoning and planOrDisconfirm when populated", () => {
    const r = validateCreatePredictionInput({
      ...validBase,
      reasoning: "The contractor confirmed the schedule last week.",
      planOrDisconfirm: "I'll check in with the contractor weekly.",
    });
    expect(r.success).toBe(true);
  });
});

describe("validateCreatePredictionInput — full valid payload", () => {
  it("round-trips with the expected shaped data", () => {
    const r = validateCreatePredictionInput(validBase);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      decision: validBase.decision,
      criterion: validBase.criterion,
      confidencePercent: 70,
      resolutionDate: validBase.resolutionDate,
    });
  });
});

describe("confidencePercentToDbString", () => {
  it("converts 1 -> '0.01'", () => {
    expect(confidencePercentToDbString(1)).toBe("0.01");
  });

  it("converts 50 -> '0.50'", () => {
    expect(confidencePercentToDbString(50)).toBe("0.50");
  });

  it("converts 99 -> '0.99'", () => {
    expect(confidencePercentToDbString(99)).toBe("0.99");
  });
});
