import { describe, expect, it, vi } from "vitest";
import { isUnderDailyCap, runEnrichWithRepair, type ModelCallResult } from "@/lib/ai/enrichCore";

describe("isUnderDailyCap — cap enforcement (pure)", () => {
  it("allows the first call of the day (0 made)", () => {
    expect(isUnderDailyCap(0)).toBe(true);
  });

  it("allows the 25th call (24 already made)", () => {
    expect(isUnderDailyCap(24)).toBe(true);
  });

  it("blocks once 25 calls have already been made (the cap)", () => {
    expect(isUnderDailyCap(25)).toBe(false);
  });

  it("stays blocked well past the cap", () => {
    expect(isUnderDailyCap(26)).toBe(false);
  });

  it("respects a custom cap", () => {
    expect(isUnderDailyCap(4, 5)).toBe(true);
    expect(isUnderDailyCap(5, 5)).toBe(false);
  });
});

describe("runEnrichWithRepair — JSON schema validation + one repair retry", () => {
  it("succeeds on the first try with a valid tool call", async () => {
    const callModel = vi.fn<(prompt: string) => Promise<ModelCallResult>>().mockResolvedValue({
      toolInput: { category: "work", reasoning_type: "base_rate" },
      inputTokens: 100,
      outputTokens: 20,
    });

    const result = await runEnrichWithRepair("I'll ship the report by Friday", null, callModel);

    expect(result.output).toEqual({ category: "work", reasoning_type: "base_rate" });
    expect(result.attempts).toBe(1);
    expect(result.totalInputTokens).toBe(100);
    expect(result.totalOutputTokens).toBe(20);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("accepts a null reasoning_type as valid", async () => {
    const callModel = vi.fn<(prompt: string) => Promise<ModelCallResult>>().mockResolvedValue({
      toolInput: { category: "self", reasoning_type: null },
      inputTokens: 50,
      outputTokens: 10,
    });

    const result = await runEnrichWithRepair("I'll go to the gym 12 times this month", null, callModel);

    expect(result.output).toEqual({ category: "self", reasoning_type: null });
    expect(result.attempts).toBe(1);
  });

  it("repairs an invalid first response and succeeds on the second attempt", async () => {
    const callModel = vi
      .fn<(prompt: string) => Promise<ModelCallResult>>()
      .mockResolvedValueOnce({
        toolInput: { category: "not-a-real-category", reasoning_type: "base_rate" },
        inputTokens: 100,
        outputTokens: 20,
      })
      .mockResolvedValueOnce({
        toolInput: { category: "money", reasoning_type: "specific_evidence" },
        inputTokens: 120,
        outputTokens: 25,
      });

    const result = await runEnrichWithRepair("The stock will hit $50", null, callModel);

    expect(result.output).toEqual({ category: "money", reasoning_type: "specific_evidence" });
    expect(result.attempts).toBe(2);
    expect(result.totalInputTokens).toBe(220);
    expect(result.totalOutputTokens).toBe(45);
    expect(callModel).toHaveBeenCalledTimes(2);

    const secondPrompt = callModel.mock.calls[1][0];
    expect(secondPrompt).toMatch(/invalid/i);
  });

  it("gives up gracefully when both attempts are invalid", async () => {
    const callModel = vi.fn<(prompt: string) => Promise<ModelCallResult>>().mockResolvedValue({
      toolInput: { category: "still-bogus" },
      inputTokens: 10,
      outputTokens: 5,
    });

    const result = await runEnrichWithRepair("Some prediction", null, callModel);

    expect(result.output).toBeNull();
    expect(result.attempts).toBe(2);
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing reasoning_type key (must be present, even if null)", async () => {
    const callModel = vi.fn<(prompt: string) => Promise<ModelCallResult>>().mockResolvedValue({
      toolInput: { category: "work" },
      inputTokens: 10,
      outputTokens: 5,
    });

    const result = await runEnrichWithRepair("Some prediction", null, callModel);

    // First attempt fails validation (missing key) -> triggers the repair
    // retry; since the fake keeps returning the same invalid shape, it still
    // gives up after exactly one repair attempt.
    expect(result.attempts).toBe(2);
    expect(result.output).toBeNull();
  });
});
