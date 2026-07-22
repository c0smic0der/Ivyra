import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAnthropicClient, HAIKU_MODEL } from "@/lib/ai/anthropic";
import { countAiCallsToday, finalizeAiCall, reserveAiCall } from "@/lib/ai/enrich";
import {
  buildPostmortemPrompt,
  POSTMORTEM_SYSTEM_PROMPT,
  type SimilarMissView,
} from "@/lib/ai/postmortemCore";
import { postmortemDecision } from "@/lib/resolve/resolveCore";
import { createClient } from "@/lib/supabase/server";
import { findSimilarMisses } from "@/lib/trackRecord/query";

// Streaming is the sanctioned exception to Server Actions (docs §7): the score
// renders instantly from the resolve action; THIS streams the narrative in
// token-by-token. Node runtime — it talks to Drizzle (postgres-js) directly.
export const runtime = "nodejs";

const OVER_CAP_MESSAGE = "AI analysis unavailable today.";
const MAX_POSTMORTEM_TOKENS = 400;

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return textResponse("", 401);

  const [row] = await db
    .select()
    .from(schema.predictions)
    .where(and(eq(schema.predictions.id, id), eq(schema.predictions.userId, user.id)));

  if (!row) return textResponse("", 404);
  // The post-mortem diffs a resolved reasoning against a known outcome — it has
  // no meaning before resolution.
  if (row.status === "open") return textResponse("", 409);

  const hasReasoning = row.reasoning !== null && row.reasoning.trim().length > 0;
  const callsToday = await countAiCallsToday(user.id);
  const decision = postmortemDecision({
    isVoid: row.status === "void",
    hasReasoning,
    existingPostmortem: row.postmortem,
    callsToday,
  });

  if (decision === "return_stored") return textResponse(row.postmortem ?? "");
  if (decision === "skip") return textResponse("");
  if (decision === "over_cap") return textResponse(OVER_CAP_MESSAGE);

  // decision === "generate" — reasoning is guaranteed present here.
  const reasoning = row.reasoning as string;
  const confidencePercent = Math.round(Number(row.confidence) * 100);

  // Top-3 similar past misses for the recurring-blind-spot line. Requires an
  // embedding (enrichment may not have run / provider is stubbed) — degrade to
  // no cross-reference rather than failing the whole post-mortem.
  let similarMisses: SimilarMissView[] = [];
  if (row.embedding) {
    const matches = await findSimilarMisses(user.id, row.embedding, row.id);
    similarMisses = matches.map((m) => ({
      text: m.text,
      confidencePercent: Math.round(m.confidence * 100),
      outcome: m.outcome,
    }));
  }

  const prompt = buildPostmortemPrompt({
    predictionText: row.text,
    reasoning,
    planOrDisconfirm: row.planOrDisconfirm,
    predictionKind: row.predictionKind,
    confidencePercent,
    outcome: row.outcome ?? false,
    outcomeNote: row.outcomeNote,
    similarMisses,
  });

  const client = getAnthropicClient();
  const encoder = new TextEncoder();
  const start = Date.now();

  // Reserve the cap slot BEFORE streaming so concurrent requests can't all
  // pass the gate against a stale pre-call count (closes the TOCTOU window the
  // security review flagged). Real token counts are filled in `finally`.
  const callId = await reserveAiCall({
    userId: user.id,
    predictionId: row.id,
    purpose: "postmortem",
    model: HAIKU_MODEL,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        const anthropicStream = client.messages.stream({
          model: HAIKU_MODEL,
          max_tokens: MAX_POSTMORTEM_TOKENS,
          // Static system prompt on its own cached block (docs §9.7).
          system: [
            { type: "text", text: POSTMORTEM_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: prompt }],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const finalMessage = await anthropicStream.finalMessage();
        inputTokens = finalMessage.usage.input_tokens;
        outputTokens = finalMessage.usage.output_tokens;

        // Persist once, only on a real completion — this is what makes a
        // revisit return_stored instead of regenerating and re-charging.
        if (full.trim().length > 0) {
          await db
            .update(schema.predictions)
            .set({ postmortem: full })
            .where(
              and(eq(schema.predictions.id, row.id), eq(schema.predictions.userId, user.id)),
            );
        }
      } catch {
        // Network/API failure mid-stream: stop cleanly. Nothing persisted, so a
        // retry regenerates. The client shows whatever streamed (possibly none).
      } finally {
        // Fill the reserved row with real usage (or 0/0 on failure — the slot
        // still counts, which is the conservative choice for a cost cap).
        await finalizeAiCall(callId, {
          inputTokens,
          outputTokens,
          latencyMs: Date.now() - start,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
