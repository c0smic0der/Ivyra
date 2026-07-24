"use server";

import { queryFullHistory } from "@/lib/insights/historyQuery";
import { EMPTY_PARAMS, type FullResult, type HistoryFullParams } from "@/lib/insights/historyView";
import { createClient } from "@/lib/supabase/server";

// The full resolution history is filtered/sorted/paged SERVER-side, but without a
// navigation: the /insights history component calls this action as the user types
// or clicks a chart, and swaps in the returned page. Auth is re-checked here and
// the query is hard-scoped to the caller's own id, so the action can only ever
// return the signed-in user's rows — the client never sees another user's data
// and never fetches the whole unbounded set.

export type FetchHistoryResult =
  | { ok: true; result: FullResult }
  | { ok: false; error: "unauthorized" | "unexpected" };

/** Sanitize whatever the client sends into a well-formed params object. The
 *  client is untrusted; never spread its payload straight into the query. */
function coerceParams(raw: Partial<HistoryFullParams>): HistoryFullParams {
  const outcome = raw.outcome;
  const sort = raw.sort;
  const dir = raw.dir;
  return {
    q: typeof raw.q === "string" ? raw.q : "",
    category: typeof raw.category === "string" ? raw.category : null,
    outcome: outcome === "yes" || outcome === "no" || outcome === "void" ? outcome : "all",
    from: typeof raw.from === "string" && raw.from !== "" ? raw.from : null,
    to: typeof raw.to === "string" && raw.to !== "" ? raw.to : null,
    confidenceLow: typeof raw.confidenceLow === "number" ? raw.confidenceLow : null,
    confidenceHigh: typeof raw.confidenceHigh === "number" ? raw.confidenceHigh : null,
    selectionIds: Array.isArray(raw.selectionIds) ? raw.selectionIds.filter((x) => typeof x === "string") : null,
    sort: sort === "confidence" || sort === "score" ? sort : "date",
    dir: dir === "asc" ? "asc" : "desc",
    page: Number.isFinite(raw.page) && raw.page! >= 1 ? Math.floor(raw.page!) : 1,
  };
}

export async function fetchHistory(raw: Partial<HistoryFullParams>): Promise<FetchHistoryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  try {
    const params = coerceParams(raw ?? EMPTY_PARAMS);
    const result = await queryFullHistory(user.id, params);
    return { ok: true, result };
  } catch (error) {
    console.error("fetchHistory: failed", error instanceof Error ? error.name : "UnknownError");
    return { ok: false, error: "unexpected" };
  }
}
