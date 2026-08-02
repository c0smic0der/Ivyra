import { describe, expect, it, vi } from "vitest";
import { backfillEmbeddings, type BackfillDeps, type BackfillRow } from "@/lib/ai/backfillCore";
import type { EmbedResult } from "@/lib/ai/embedding";

const row = (id: string, reasoning: string | null = null): BackfillRow => ({
  id,
  userId: "user-1",
  text: `claim ${id}`,
  reasoning,
});

function deps(overrides: Partial<BackfillDeps> = {}): BackfillDeps & {
  persistEmbedding: ReturnType<typeof vi.fn>;
  logCall: ReturnType<typeof vi.fn>;
} {
  let clock = 1000;
  return {
    embed: vi
      .fn<BackfillDeps["embed"]>()
      .mockResolvedValue({ embedding: [0.1, 0.2, 0.3], inputTokens: 11 } satisfies EmbedResult),
    persistEmbedding: vi.fn<BackfillDeps["persistEmbedding"]>().mockResolvedValue(),
    logCall: vi.fn<BackfillDeps["logCall"]>().mockResolvedValue(),
    now: () => (clock += 5), // +5ms each read → deterministic latency
    ...overrides,
  } as BackfillDeps & {
    persistEmbedding: ReturnType<typeof vi.fn>;
    logCall: ReturnType<typeof vi.fn>;
  };
}

describe("backfillEmbeddings — happy path", () => {
  it("embeds, persists, and logs one call per row", async () => {
    const d = deps();
    const result = await backfillEmbeddings([row("a"), row("b"), row("c")], d);

    expect(result).toMatchObject({ embedded: 3, failed: 0, total: 3, tokens: 33 });
    expect(d.persistEmbedding).toHaveBeenCalledTimes(3);
    expect(d.persistEmbedding).toHaveBeenCalledWith("a", [0.1, 0.2, 0.3]);
    expect(d.logCall).toHaveBeenCalledTimes(3);
    // logCall carries the row (so the binding can attribute userId/predictionId).
    expect(d.logCall.mock.calls[0][0]).toMatchObject({ id: "a", userId: "user-1" });
    expect(d.logCall.mock.calls[0][1]).toMatchObject({ inputTokens: 11 });
  });

  it("writes the vector BEFORE logging (crash-safe ordering)", async () => {
    const order: string[] = [];
    const d = deps({
      persistEmbedding: vi.fn(async () => {
        order.push("persist");
      }),
      logCall: vi.fn(async () => {
        order.push("log");
      }),
    });
    await backfillEmbeddings([row("a")], d);
    expect(order).toEqual(["persist", "log"]);
  });

  it("progress lines carry the row id + index/total + status, never the prediction text", async () => {
    const lines: string[] = [];
    const d = deps({
      embed: vi
        .fn<BackfillDeps["embed"]>()
        .mockResolvedValueOnce({ embedding: [1], inputTokens: 7 })
        .mockResolvedValueOnce(null),
      onProgress: (line) => lines.push(line),
    });
    // text is `claim id-a` / `claim id-b` (see row()); it must never reach a log line.
    await backfillEmbeddings([row("id-a"), row("id-b", "secret reasoning")], d);

    expect(lines).toEqual([
      "[1/2] id-a embedded (7 tok)",
      "[2/2] id-b FAILED (left null, will retry next run)",
    ]);
    // No prediction content (CLAUDE.md logging rule) in any progress line.
    for (const line of lines) {
      expect(line).not.toContain("claim");
      expect(line).not.toContain("secret");
    }
  });

  it("handles an empty row list without touching any dep (idempotent second run)", async () => {
    const d = deps();
    const result = await backfillEmbeddings([], d);
    expect(result).toEqual({ embedded: 0, failed: 0, total: 0, tokens: 0 });
    expect(d.embed).not.toHaveBeenCalled();
    expect(d.persistEmbedding).not.toHaveBeenCalled();
    expect(d.logCall).not.toHaveBeenCalled();
  });
});

describe("backfillEmbeddings — degradation (never blocks, never mislogs)", () => {
  it("a null embed leaves the row unwritten and unlogged, counted as failed", async () => {
    const d = deps({ embed: vi.fn<BackfillDeps["embed"]>().mockResolvedValue(null) });
    const result = await backfillEmbeddings([row("a"), row("b")], d);

    expect(result).toMatchObject({ embedded: 0, failed: 2, tokens: 0 });
    expect(d.persistEmbedding).not.toHaveBeenCalled();
    expect(d.logCall).not.toHaveBeenCalled();
  });

  it("a throwing embed degrades to a failure without throwing", async () => {
    const d = deps({ embed: vi.fn<BackfillDeps["embed"]>().mockRejectedValue(new Error("ECONNRESET")) });
    await expect(backfillEmbeddings([row("a")], d)).resolves.toMatchObject({ embedded: 0, failed: 1 });
    expect(d.logCall).not.toHaveBeenCalled();
  });

  it("continues past a failed row and still embeds the rest", async () => {
    const embed = vi
      .fn<BackfillDeps["embed"]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ embedding: [1], inputTokens: 7 });
    const d = deps({ embed });
    const result = await backfillEmbeddings([row("a"), row("b"), row("c")], d);
    expect(result).toMatchObject({ embedded: 2, failed: 1, tokens: 14 });
  });
});
