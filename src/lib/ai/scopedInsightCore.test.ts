import { describe, expect, it, vi } from "vitest";
import type { ModelCallResult } from "@/lib/ai/enrichCore";
import {
  buildScopedInsightPrompt,
  runInsightWithRepair,
  runScopedInsight,
  SCOPED_INSIGHT_PROMPT_VERSION,
  SCOPED_INSIGHT_SYSTEM_PROMPT,
  scopeStatsJson,
  type ScopeStats,
} from "@/lib/ai/scopedInsightCore";
import { scopedInsightOutputSchema } from "@/lib/ai/scopedInsightSchema";

function stats(overrides: Partial<ScopeStats> = {}): ScopeStats {
  return {
    scope: "lifetime",
    n: 24,
    profile: "miscalibrated",
    brier: 0.31,
    bias: 0.18,
    boldness: 0.42,
    reasoningGroups: [
      {
        key: "plan_optimism",
        gloss: "the reason was their own intention or plan to follow through",
        n: 13,
        hits: 4,
        hitExamples: ["ship the redesign on time"],
        missExamples: ["finish the migration by Friday", "keep a 7-day meditation streak"],
      },
      {
        key: "trust_in_person",
        gloss: "the reason rested on trust in a specific person's reliability or track record",
        n: 6,
        hits: 4,
        hitExamples: ["my teammate ships on time", "the candidate accepts the offer"],
        missExamples: ["the vendor delivers in Q3"],
      },
    ],
    byCategory: [{ key: "work", n: 12, hits: 6, meanConfidence: 0.82, hitRate: 0.5, bias: 0.32 }],
    samples: [
      {
        text: "I'll finish the migration by Friday",
        reasoningType: "plan_optimism",
        confidencePercent: 85,
        outcome: false,
        reasoning: "I'll make time for it this week",
        outcomeNote: "Got pulled onto the launch instead",
      },
    ],
    chart: {
      curveBuckets: [
        { center: 0.8, hitRate: 0.5, n: 12 },
        { center: 0.6, hitRate: 0.58, n: 8 },
      ],
      progress: { recent: 0.16, lifetime: 0.24 },
    },
    ...overrides,
  };
}

function ok(input: unknown, tokens = { input: 100, output: 40 }): ModelCallResult {
  return { toolInput: input, inputTokens: tokens.input, outputTokens: tokens.output };
}

describe("scopedInsightOutputSchema", () => {
  it("accepts a single non-empty insight string", () => {
    expect(scopedInsightOutputSchema.safeParse({ insight: "You run overconfident." }).success).toBe(
      true,
    );
  });

  it("rejects an empty / whitespace insight", () => {
    expect(scopedInsightOutputSchema.safeParse({ insight: "   " }).success).toBe(false);
    expect(scopedInsightOutputSchema.safeParse({ insight: "" }).success).toBe(false);
  });

  it("rejects any extra field — the model cannot smuggle a fabricated number back", () => {
    // .strict(): a `brier`/`bias`/any number field alongside the prose fails
    // validation, so a score can never re-enter through the tool call.
    const parsed = scopedInsightOutputSchema.safeParse({ insight: "ok", brier: 0.1 });
    expect(parsed.success).toBe(false);
  });
});

describe("buildScopedInsightPrompt", () => {
  it("anchors to the user's OWN example predictions, grouped, never leaking a label", () => {
    const prompt = buildScopedInsightPrompt(stats());
    expect(prompt).toContain("PRIMARY LENS");
    // The actual prediction titles are present — the anchoring material.
    expect(prompt).toContain("finish the migration by Friday");
    expect(prompt).toContain("keep a 7-day meditation streak");
    expect(prompt).toContain("my teammate ships on time");
    // Counts as "X of N hit"; the gloss is an internal, do-not-repeat hint.
    expect(prompt).toContain("4 of 13 hit");
    expect(prompt).toContain("4 of 6 hit");
    expect(prompt).toContain("do NOT repeat or paraphrase");
    // No enum labels ever leak.
    expect(prompt).not.toContain("plan_optimism");
    expect(prompt).not.toContain("trust_in_person");
  });

  it("drops per-row bias-point and mean-confidence figures (sparse numbers)", () => {
    const prompt = buildScopedInsightPrompt(stats());
    expect(prompt).not.toContain("mean confidence");
    expect(prompt).not.toMatch(/bias [+-]?\d/);
    expect(prompt).toContain("HOW THEY REASON");
  });

  it("passes the chart data verbatim as the ONLY basis for chart commentary", () => {
    const prompt = buildScopedInsightPrompt(stats());
    expect(prompt).toContain("CHART DATA");
    expect(prompt).toContain("Calibration curve on the page");
    expect(prompt).toContain("around 80% confidence: actually came true 50%");
    expect(prompt).toContain("recent Brier 0.16 vs lifetime 0.24");
  });

  it("marks a locked chart as absent so the model won't reference it", () => {
    const prompt = buildScopedInsightPrompt(stats({ chart: { curveBuckets: [], progress: null } }));
    expect(prompt).toContain("Calibration curve: not shown yet (locked)");
    expect(prompt).toContain("Progress chart: not shown yet (locked)");
  });

  it("feeds the user's own missed predictions with reasoning + note for the fix", () => {
    const prompt = buildScopedInsightPrompt(stats());
    expect(prompt).toContain("missed predictions");
    expect(prompt).toContain("I'll finish the migration by Friday");
    expect(prompt).toContain("I'll make time for it this week");
    expect(prompt).toContain("Got pulled onto the launch instead");
  });

  it("degrades gracefully when a scope has no reasoned misses", () => {
    const prompt = buildScopedInsightPrompt(stats({ samples: [] }));
    expect(prompt).toContain("No missed predictions with written reasoning");
  });

  it("names the scope so the insight can state which slice it describes", () => {
    expect(buildScopedInsightPrompt(stats({ scope: "recent" }))).toContain("(recent)");
    expect(buildScopedInsightPrompt(stats({ scope: "lifetime" }))).toContain("lifetime");
    expect(buildScopedInsightPrompt(stats({ scope: "category:work" }))).toContain("work category");
  });
});

describe("SCOPED_INSIGHT_SYSTEM_PROMPT", () => {
  it("makes anchoring to the user's own predictions the core instruction", () => {
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT).toContain("ANCHOR TO THEIR OWN PREDICTIONS");
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT.toLowerCase()).toContain("example titles");
  });

  it("requires sparse numbers and forbids bias-point figures", () => {
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT).toContain("SPARSE NUMBERS");
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT.toLowerCase()).toContain("never state a bias-point figure");
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT.toLowerCase()).toContain("plain comparisons");
  });

  it("guards chart commentary to only what the supplied numbers show", () => {
    const lower = SCOPED_INSIGHT_SYSTEM_PROMPT.toLowerCase();
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT).toContain("CHART HELP");
    expect(lower).toContain("only describe features that are present in the supplied chart numbers");
    expect(lower).toContain("omit chart commentary");
  });

  it("frames the tone as a coach — weakness is 'the most room to improve'", () => {
    const lower = SCOPED_INSIGHT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("most room to improve");
    expect(lower).toContain("coach, not a critic");
    expect(lower).toContain("do not hedge");
  });

  it("forbids naming or paraphrasing the internal reasoning taxonomy", () => {
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT).toContain("PLAIN LANGUAGE, NO LABELS");
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT.toLowerCase()).toContain("never name or paraphrase a reasoning category");
  });

  it("permits a category only as a SECONDARY aside, with its count", () => {
    expect(SCOPED_INSIGHT_SYSTEM_PROMPT).toContain("CATEGORY IS SECONDARY");
  });
});

describe("runInsightWithRepair", () => {
  it("returns the parsed output on a valid first call (one attempt)", async () => {
    const call = vi.fn(async () => ok({ insight: "You run overconfident." }));
    const result = await runInsightWithRepair("p", call);
    expect(result).toMatchObject({ attempts: 1, output: { insight: "You run overconfident." } });
    expect(call).toHaveBeenCalledOnce();
  });

  it("repairs once and accumulates tokens across both attempts", async () => {
    const call = vi
      .fn<(p: string) => Promise<ModelCallResult>>()
      .mockResolvedValueOnce(ok({ wrong: true }, { input: 100, output: 10 }))
      .mockResolvedValueOnce(ok({ insight: "Fixed." }, { input: 120, output: 20 }));
    const result = await runInsightWithRepair("p", call);
    expect(result.attempts).toBe(2);
    expect(result.output).toEqual({ insight: "Fixed." });
    expect(result.totalInputTokens).toBe(220);
    expect(result.totalOutputTokens).toBe(30);
  });

  it("returns null output when the repair is still invalid", async () => {
    const call = vi.fn(async () => ok({ nope: 1 }));
    const result = await runInsightWithRepair("p", call);
    expect(result.attempts).toBe(2);
    expect(result.output).toBeNull();
  });
});

describe("runScopedInsight", () => {
  const clock = () => {
    let t = 1000;
    return () => (t += 5);
  };

  it("persists the DETERMINISTIC scope count + code prompt version, never a model number", async () => {
    const persist =
      vi.fn<
        (bodyText: string, n: number, promptVersion: number, statsJson: Record<string, unknown>) => Promise<void>
      >(async () => {});
    const logCall = vi.fn(async () => {});
    // The model's prose even mentions a different count — persistence must ignore
    // it and stamp stats.n. This is the "no scoring number read back" guarantee.
    const s = stats({ n: 24 });
    const result = await runScopedInsight(s, {
      runInsight: async () => ({
        output: { insight: "Across 999 predictions you run overconfident." },
        totalInputTokens: 200,
        totalOutputTokens: 50,
        attempts: 1,
      }),
      persist,
      logCall,
      now: clock(),
    });

    expect(result).toEqual({ ok: true, bodyText: "Across 999 predictions you run overconfident." });
    expect(persist).toHaveBeenCalledOnce();
    const [bodyText, nAtGen, promptVersion, statsJson] = persist.mock.calls[0];
    expect(nAtGen).toBe(24); // stats.n — NOT the 999 in the prose
    expect(promptVersion).toBe(SCOPED_INSIGHT_PROMPT_VERSION); // code-controlled, stamped at generation
    expect(bodyText).toBe("Across 999 predictions you run overconfident.");
    expect(statsJson).toEqual(scopeStatsJson(s));
    expect(logCall).toHaveBeenCalledWith({ inputTokens: 200, outputTokens: 50, latencyMs: 5 });
  });

  it("logs a zero-cost attempt and does NOT persist when the call throws (graceful fallback)", async () => {
    const persist = vi.fn(async () => {});
    const logCall = vi.fn(async () => {});
    const result = await runScopedInsight(stats(), {
      runInsight: async () => {
        throw new Error("network down");
      },
      persist,
      logCall,
      now: clock(),
    });

    expect(result).toEqual({ ok: false, bodyText: null });
    expect(persist).not.toHaveBeenCalled();
    expect(logCall).toHaveBeenCalledWith({ inputTokens: 0, outputTokens: 0, latencyMs: 5 });
  });

  it("logs the spend but does NOT persist when the repair still fails validation", async () => {
    const persist = vi.fn(async () => {});
    const logCall = vi.fn(async () => {});
    const result = await runScopedInsight(stats(), {
      runInsight: async () => ({
        output: null,
        totalInputTokens: 300,
        totalOutputTokens: 5,
        attempts: 2,
      }),
      persist,
      logCall,
      now: clock(),
    });

    expect(result).toEqual({ ok: false, bodyText: null });
    expect(persist).not.toHaveBeenCalled();
    expect(logCall).toHaveBeenCalledWith({ inputTokens: 300, outputTokens: 5, latencyMs: 5 });
  });
});
