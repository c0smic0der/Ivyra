import { describe, expect, it, vi } from "vitest";
import {
  buildPostmortemPrompt,
  consumePostmortemStream,
  isMiss,
  POSTMORTEM_EXCERPT_CHAR_BUDGET,
  type ModelStream,
  type PostmortemInputs,
  type PostmortemStreamDeps,
} from "./postmortemCore";

describe("isMiss — a miss is the wrong side of the 0.25 baseline", () => {
  it("is a miss when confident and wrong", () => {
    expect(isMiss(0.9, false)).toBe(true); // brier 0.81
    expect(isMiss(0.8, false)).toBe(true); // brier 0.64
  });

  it("is not a miss when confident and right", () => {
    expect(isMiss(0.9, true)).toBe(false); // brier 0.01
  });

  it("a 50/50 call is never a miss (brier exactly 0.25, not worse)", () => {
    expect(isMiss(0.5, true)).toBe(false);
    expect(isMiss(0.5, false)).toBe(false);
  });

  it("a low-confidence YES that happened is a miss (under-confident wrong side)", () => {
    expect(isMiss(0.2, true)).toBe(true); // brier 0.64
  });
});

describe("buildPostmortemPrompt — anchors only to user-written text", () => {
  const base: PostmortemInputs = {
    predictionText: "The kitchen reno finishes by Aug 15",
    reasoning: "The contractor promised it and has been reliable",
    planOrDisconfirm: "If the permit is denied I'd drop confidence",
    predictionKind: "world",
    confidencePercent: 85,
    outcome: false,
    outcomeNote: "Permit came back two weeks late",
    similarMisses: [],
  };

  it("includes every user field verbatim", () => {
    const prompt = buildPostmortemPrompt(base);
    expect(prompt).toContain(base.predictionText);
    expect(prompt).toContain(base.reasoning);
    expect(prompt).toContain(base.planOrDisconfirm!);
    expect(prompt).toContain("85%");
    expect(prompt).toContain(base.outcomeNote!);
    expect(prompt).toContain("NO — it did not happen");
  });

  it("labels the second field by prediction kind", () => {
    expect(buildPostmortemPrompt(base)).toContain("What would change their mind:");
    const selfKind = buildPostmortemPrompt({ ...base, predictionKind: "self" });
    expect(selfKind).toContain("Their plan:");
  });

  it("omits optional fields cleanly when absent", () => {
    const prompt = buildPostmortemPrompt({ ...base, planOrDisconfirm: null, outcomeNote: null });
    expect(prompt).not.toContain("What would change their mind");
    expect(prompt).not.toContain("note on what happened");
  });

  it("caps an oversized reasoning / outcome_note at the excerpt budget (truncates on input)", () => {
    const bigReasoning = "R".repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET + 500);
    const bigNote = "N".repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET + 500);
    const prompt = buildPostmortemPrompt({ ...base, reasoning: bigReasoning, outcomeNote: bigNote });

    // The full oversized fields never reach the prompt...
    expect(prompt).not.toContain(bigReasoning);
    expect(prompt).not.toContain(bigNote);
    // ...only a budgeted excerpt does, marked as clipped with an ellipsis.
    expect(prompt).toContain("R".repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET) + "…");
    expect(prompt).toContain("N".repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET) + "…");
    // The reasoning line carries at most budget + label + one ellipsis char.
    const reasoningLine = prompt.split("\n").find((l) => l.startsWith("Their reasoning:"))!;
    expect(reasoningLine.length).toBeLessThanOrEqual(
      "Their reasoning: ".length + POSTMORTEM_EXCERPT_CHAR_BUDGET + 1,
    );
  });

  it("leaves an at-budget field untouched (no ellipsis added)", () => {
    const exact = "x".repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET);
    const prompt = buildPostmortemPrompt({ ...base, reasoning: exact });
    expect(prompt).toContain(`Their reasoning: ${exact}`);
    expect(prompt).not.toContain(`${exact}…`);
  });

  it("lists similar past misses when provided", () => {
    const prompt = buildPostmortemPrompt({
      ...base,
      similarMisses: [
        { text: "The deck project finishes on time", confidencePercent: 80, outcome: false },
      ],
    });
    expect(prompt).toContain("similar past misses");
    expect(prompt).toContain("The deck project finishes on time");
    expect(prompt).toContain("80% confident");
  });
});

describe("consumePostmortemStream — graceful degradation (streaming never rejects)", () => {
  // Builds a ModelStream from a fixed chunk list; `usage` resolves after drain.
  function streamFrom(chunks: string[], usage = { inputTokens: 100, outputTokens: 20 }): ModelStream {
    return {
      chunks: (async function* () {
        for (const c of chunks) yield c;
      })(),
      usage: async () => usage,
    };
  }

  // A stream that yields some chunks then throws mid-iteration (API drop).
  function throwingStream(before: string[]): ModelStream {
    return {
      chunks: (async function* () {
        for (const c of before) yield c;
        throw new Error("connection reset");
      })(),
      usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
    };
  }

  // Returns freshly-typed mocks (no spread widening); tests override behavior by
  // mutating a specific mock (e.g. deps.persist.mockRejectedValue).
  function makeDeps(open: () => ModelStream, now?: () => number) {
    return {
      open,
      emit: vi.fn<PostmortemStreamDeps["emit"]>(),
      persist: vi.fn<PostmortemStreamDeps["persist"]>().mockResolvedValue(),
      finalize: vi.fn<PostmortemStreamDeps["finalize"]>().mockResolvedValue(),
      now,
    };
  }

  it("happy path: emits deltas in order, persists the joined text once, finalizes with usage", async () => {
    const deps = makeDeps(() => streamFrom(["Your reasoning ", "missed the dependency."]));
    await consumePostmortemStream(deps);

    expect(deps.emit.mock.calls.map((c) => c[0])).toEqual(["Your reasoning ", "missed the dependency."]);
    expect(deps.persist).toHaveBeenCalledOnce();
    expect(deps.persist.mock.calls[0][0]).toBe("Your reasoning missed the dependency.");
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(deps.finalize.mock.calls[0][0]).toMatchObject({ inputTokens: 100, outputTokens: 20 });
  });

  it("stream throws mid-way: emits pre-throw chunks, does NOT persist, still finalizes 0/0", async () => {
    const deps = makeDeps(() => throwingStream(["Partial text "]));

    await expect(consumePostmortemStream(deps)).resolves.toBeUndefined();

    expect(deps.emit.mock.calls.map((c) => c[0])).toEqual(["Partial text "]);
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(deps.finalize.mock.calls[0][0]).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it("empty stream: never persists (nothing to store) but still finalizes", async () => {
    const deps = makeDeps(() => streamFrom([]));
    await consumePostmortemStream(deps);

    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledOnce();
  });

  it("whitespace-only stream: does not persist (trimmed to empty)", async () => {
    const deps = makeDeps(() => streamFrom(["  ", "\n"]));
    await consumePostmortemStream(deps);

    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledOnce();
  });

  it("usage() rejects after a clean drain: does not persist, finalizes 0/0", async () => {
    const stream: ModelStream = {
      chunks: (async function* () {
        yield "Some text";
      })(),
      usage: async () => {
        throw new Error("finalMessage failed");
      },
    };
    const deps = makeDeps(() => stream);

    await expect(consumePostmortemStream(deps)).resolves.toBeUndefined();
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.finalize.mock.calls[0][0]).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it("persist rejects: finalize still runs (persist is in try, finalize in finally)", async () => {
    const deps = makeDeps(() => streamFrom(["text"]));
    deps.persist.mockRejectedValue(new Error("db down"));

    await expect(consumePostmortemStream(deps)).resolves.toBeUndefined();
    expect(deps.finalize).toHaveBeenCalledOnce();
  });

  it("orders emit → persist → finalize and reports injected-clock latency", async () => {
    const now = vi.fn<() => number>().mockReturnValueOnce(2000).mockReturnValueOnce(2500);
    const deps = makeDeps(() => streamFrom(["a", "b"]), now);

    await consumePostmortemStream(deps);

    expect(deps.emit.mock.invocationCallOrder[0]).toBeLessThan(deps.persist.mock.invocationCallOrder[0]);
    expect(deps.persist.mock.invocationCallOrder[0]).toBeLessThan(deps.finalize.mock.invocationCallOrder[0]);
    expect(deps.finalize.mock.calls[0][0].latencyMs).toBe(500);
  });
});
