import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  embeddingCostUsd,
  embedTextWithUsage,
  OPENAI_EMBEDDING_MODEL,
} from "@/lib/ai/embedding";
import { POSTMORTEM_EXCERPT_CHAR_BUDGET } from "@/lib/ai/postmortemCore";

// A well-formed OpenAI embeddings response fake. `dims` lets a test produce a
// wrong-length vector to exercise the shape guard.
function okResponse(inputTokens: number, dims: number = EMBEDDING_DIMENSIONS) {
  return {
    ok: true,
    json: async () => ({
      data: [{ embedding: Array(dims).fill(0.01) }],
      usage: { prompt_tokens: inputTokens },
    }),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("embedTextWithUsage — happy path", () => {
  it("returns the vector + token usage and calls OpenAI with the right params", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okResponse(42));

    const result = await embedTextWithUsage("ship by Friday", "team is on track", fetchImpl);

    expect(result).not.toBeNull();
    expect(result!.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(result!.inputTokens).toBe(42);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe(OPENAI_EMBEDDING_MODEL);
    expect(body.dimensions).toBe(EMBEDDING_DIMENSIONS);
    // prediction + reasoning are embedded together
    expect(body.input).toBe("ship by Friday\n\nteam is on track");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer sk-test" });
  });

  it("embeds text alone when there's no reasoning", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okResponse(10));

    await embedTextWithUsage("ship by Friday", null, fetchImpl);

    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.input).toBe("ship by Friday");
  });

  it("caps text and reasoning to the post-mortem excerpt budget before embedding", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okResponse(10));

    const bigText = "T".repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET + 500);
    const bigReasoning = "R".repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET + 500);
    await embedTextWithUsage(bigText, bigReasoning, fetchImpl);

    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    // Each field clipped to the budget and marked with an ellipsis, joined by \n\n.
    const clip = (ch: string) => ch.repeat(POSTMORTEM_EXCERPT_CHAR_BUDGET) + "…";
    expect(body.input).toBe(`${clip("T")}\n\n${clip("R")}`);
  });
});

describe("embedTextWithUsage — null-degradation (never throws)", () => {
  it("returns null and never calls the network when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await embedTextWithUsage("anything", null, fetchImpl);

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null on a non-2xx response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);

    expect(await embedTextWithUsage("anything", null, fetchImpl)).toBeNull();
  });

  it("returns null when fetch itself rejects (network error)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNRESET"));

    await expect(embedTextWithUsage("anything", null, fetchImpl)).resolves.toBeNull();
  });

  it("returns null on a malformed body (no data array)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);

    expect(await embedTextWithUsage("anything", null, fetchImpl)).toBeNull();
  });

  it("rejects a wrong-length vector rather than storing a corrupt embedding", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okResponse(5, 512));

    expect(await embedTextWithUsage("anything", null, fetchImpl)).toBeNull();
  });
});

describe("embeddingCostUsd", () => {
  it("prices at $0.02 / 1M tokens (6dp string for the numeric column)", () => {
    expect(embeddingCostUsd(1_000_000)).toBe("0.020000");
    expect(embeddingCostUsd(0)).toBe("0.000000");
    // A typical short prediction (~20 tokens) costs a fraction of a cent.
    expect(embeddingCostUsd(20)).toBe("0.000000");
    expect(embeddingCostUsd(500_000)).toBe("0.010000");
  });
});
