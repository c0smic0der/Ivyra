import { describe, expect, it, vi } from "vitest";
import {
  enrichAndPersist,
  isUnderDailyCap,
  runEnrichWithRepair,
  type EnrichPersistDeps,
  type EnrichWithRepairResult,
  type ModelCallResult,
} from "@/lib/ai/enrichCore";

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

describe("enrichAndPersist — graceful degradation (AI failure never breaks the row)", () => {
  const okEnrich = (
    output: EnrichWithRepairResult["output"],
    inputTokens = 100,
    outputTokens = 20,
  ): EnrichWithRepairResult => ({
    output,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    attempts: 1,
  });

  // Returns freshly-typed mocks (no spread widening, so `.mock` stays typed);
  // tests override a specific dep's behavior by calling e.g. deps.embed.mockRejectedValue.
  function makeDeps(now?: () => number) {
    return {
      runEnrich: vi
        .fn<EnrichPersistDeps["runEnrich"]>()
        .mockResolvedValue(okEnrich({ category: "work", reasoning_type: "base_rate" })),
      embed: vi.fn<EnrichPersistDeps["embed"]>().mockResolvedValue([0.1, 0.2, 0.3]),
      logCall: vi.fn<EnrichPersistDeps["logCall"]>().mockResolvedValue(),
      persist: vi.fn<EnrichPersistDeps["persist"]>().mockResolvedValue(),
      now,
    };
  }

  it("happy path: logs real tokens, persists enrichment + embedding", async () => {
    const deps = makeDeps();
    await enrichAndPersist("I ship the report by Friday", "team is on track", deps);

    expect(deps.logCall).toHaveBeenCalledOnce();
    expect(deps.logCall.mock.calls[0][0]).toMatchObject({ inputTokens: 100, outputTokens: 20 });
    expect(deps.embed).toHaveBeenCalledWith("I ship the report by Friday", "team is on track");
    expect(deps.persist).toHaveBeenCalledOnce();
    expect(deps.persist.mock.calls[0][0]).toEqual({
      category: "work",
      reasoningType: "base_rate",
      embedding: [0.1, 0.2, 0.3],
    });
  });

  it("AI call rejects: still logs 0/0 tokens, persists all-null, does not throw", async () => {
    const deps = makeDeps();
    deps.runEnrich.mockRejectedValue(new Error("API down"));

    await expect(enrichAndPersist("Some prediction", null, deps)).resolves.toBeUndefined();

    expect(deps.logCall.mock.calls[0][0]).toMatchObject({ inputTokens: 0, outputTokens: 0 });
    // Embedding is independent of enrichment, so it still runs and persists.
    expect(deps.persist.mock.calls[0][0]).toEqual({
      category: null,
      reasoningType: null,
      embedding: [0.1, 0.2, 0.3],
    });
  });

  it("embed rejects: persists null embedding but keeps successful enrichment, does not throw", async () => {
    const deps = makeDeps();
    deps.embed.mockRejectedValue(new Error("embed provider down"));

    await expect(enrichAndPersist("Some prediction", null, deps)).resolves.toBeUndefined();

    expect(deps.logCall.mock.calls[0][0]).toMatchObject({ inputTokens: 100, outputTokens: 20 });
    expect(deps.persist.mock.calls[0][0]).toEqual({
      category: "work",
      reasoningType: "base_rate",
      embedding: null,
    });
  });

  it("both AI and embed reject: persists all-null with 0/0 tokens", async () => {
    const deps = makeDeps();
    deps.runEnrich.mockRejectedValue(new Error("x"));
    deps.embed.mockRejectedValue(new Error("y"));

    await enrichAndPersist("Some prediction", null, deps);

    expect(deps.logCall.mock.calls[0][0]).toMatchObject({ inputTokens: 0, outputTokens: 0 });
    expect(deps.persist.mock.calls[0][0]).toEqual({
      category: null,
      reasoningType: null,
      embedding: null,
    });
  });

  it("null embedding (the current stub) persists as null without error", async () => {
    const deps = makeDeps();
    deps.embed.mockResolvedValue(null);

    await enrichAndPersist("Some prediction", null, deps);

    expect(deps.persist.mock.calls[0][0].embedding).toBeNull();
  });

  it("always logs BEFORE persisting, so the cap row exists even if persist later fails", async () => {
    const deps = makeDeps();
    await enrichAndPersist("Some prediction", null, deps);

    expect(deps.logCall.mock.invocationCallOrder[0]).toBeLessThan(
      deps.persist.mock.invocationCallOrder[0],
    );
  });

  it("reports deterministic latency from the injected clock", async () => {
    const now = vi.fn<() => number>().mockReturnValueOnce(1000).mockReturnValueOnce(1400);
    const deps = makeDeps(now);

    await enrichAndPersist("Some prediction", null, deps);

    expect(deps.logCall.mock.calls[0][0].latencyMs).toBe(400);
  });
});
