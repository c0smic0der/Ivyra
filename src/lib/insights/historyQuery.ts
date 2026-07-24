import { and, asc, count, desc, eq, gte, ilike, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  COMPACT_LIMIT,
  type CompactResult,
  type FullResult,
  type HistoryFullParams,
  HISTORY_PAGE_SIZE,
} from "./historyView";

// Server-side resolution-history query — the ONE read the dashboard (compact)
// and /insights (full) both use. It is a faithful SQL translation of
// runHistoryQuery in historyView.ts (which the tests certify): same scoping,
// filters, sort, and paging. The userId guard and the resolved/void status guard
// are non-optional base conditions ANDed into every query, so no filter
// combination — and no caller — can return another user's rows.

const p = schema.predictions;

/** Build the WHERE conditions for full mode. userId + status are always first. */
function fullConditions(userId: string, params: HistoryFullParams): SQL[] {
  const conds: SQL[] = [eq(p.userId, userId), inArray(p.status, ["resolved", "void"])];

  const needle = params.q.trim();
  if (needle !== "") conds.push(ilike(p.text, `%${needle}%`));
  if (params.category !== null) conds.push(eq(p.category, params.category));

  switch (params.outcome) {
    case "yes":
      conds.push(and(eq(p.status, "resolved"), eq(p.outcome, true))!);
      break;
    case "no":
      conds.push(and(eq(p.status, "resolved"), eq(p.outcome, false))!);
      break;
    case "void":
      conds.push(eq(p.status, "void"));
      break;
    default:
      break;
  }

  // Confidence is a numeric column; compare against string literals. Band is
  // left-closed / right-open, top band [.9, 1] closed — matches the deciles.
  if (params.confidenceLow !== null) conds.push(gte(p.confidence, String(params.confidenceLow)));
  if (params.confidenceHigh !== null) {
    conds.push(
      params.confidenceHigh >= 1
        ? lte(p.confidence, String(params.confidenceHigh))
        : lt(p.confidence, String(params.confidenceHigh)),
    );
  }

  if (params.selectionIds !== null) {
    // Empty selection = matches nothing (distinct from "no selection").
    conds.push(params.selectionIds.length === 0 ? sql`false` : inArray(p.id, params.selectionIds));
  }

  // resolved_at is a timestamp; the bounds are calendar days (inclusive). Compare
  // on the UTC date so a row resolved any time on `to` still counts.
  const resolvedDay = sql`(${p.resolvedAt} AT TIME ZONE 'UTC')::date`;
  if (params.from !== null) conds.push(gte(resolvedDay, params.from));
  if (params.to !== null) conds.push(lte(resolvedDay, params.to));

  return conds;
}

function orderBy(params: HistoryFullParams) {
  const dir = params.dir === "asc" ? asc : desc;
  if (params.sort === "confidence") return [dir(p.confidence), desc(p.resolvedAt), asc(p.id)];
  if (params.sort === "score") {
    // Voids (null Brier) always last, both directions — `NULLS LAST` on the sort key.
    const key = params.dir === "asc" ? sql`${p.brierScore} asc nulls last` : sql`${p.brierScore} desc nulls last`;
    return [key, desc(p.resolvedAt), asc(p.id)];
  }
  return [dir(p.resolvedAt), asc(p.id)];
}

/** Compact glance: the most recent COMPACT_LIMIT resolutions, no filters, and no
 *  confidence/Brier fields (the dashboard shows only the plain record). */
export async function queryCompactHistory(userId: string): Promise<CompactResult> {
  const base = and(eq(p.userId, userId), inArray(p.status, ["resolved", "void"]));

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: p.id,
        text: p.text,
        outcome: p.outcome,
        status: p.status,
        resolvedAt: p.resolvedAt,
      })
      .from(p)
      .where(base)
      .orderBy(desc(p.resolvedAt), asc(p.id))
      .limit(COMPACT_LIMIT),
    db.select({ n: count() }).from(p).where(base),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      text: r.text,
      outcome: r.outcome,
      status: r.status as "resolved" | "void",
      resolvedAt: r.resolvedAt!.toISOString(),
    })),
    total: Number(totalRow[0]?.n ?? 0),
  };
}

/** Full history: filtered, sorted, paged — one bounded page, never the whole set. */
export async function queryFullHistory(userId: string, params: HistoryFullParams): Promise<FullResult> {
  const conds = fullConditions(userId, params);
  const where = and(...conds);

  const totalRow = await db.select({ n: count() }).from(p).where(where);
  const total = Number(totalRow[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, params.page), totalPages);

  const rows = await db
    .select({
      id: p.id,
      text: p.text,
      confidence: p.confidence,
      outcome: p.outcome,
      status: p.status,
      category: p.category,
      brier: p.brierScore,
      resolvedAt: p.resolvedAt,
      predictionKind: p.predictionKind,
      reasoning: p.reasoning,
      planOrDisconfirm: p.planOrDisconfirm,
      outcomeNote: p.outcomeNote,
      postmortem: p.postmortem,
    })
    .from(p)
    .where(where)
    .orderBy(...orderBy(params))
    .limit(HISTORY_PAGE_SIZE)
    .offset((page - 1) * HISTORY_PAGE_SIZE);

  return {
    items: rows.map((r) => ({
      id: r.id,
      text: r.text,
      confidence: Number(r.confidence),
      outcome: r.outcome,
      status: r.status as "resolved" | "void",
      category: r.category,
      brier: r.brier === null ? null : Number(r.brier),
      resolvedAt: r.resolvedAt!.toISOString(),
      predictionKind: r.predictionKind,
      reasoning: r.reasoning,
      planOrDisconfirm: r.planOrDisconfirm,
      outcomeNote: r.outcomeNote,
      postmortem: r.postmortem,
    })),
    total,
    page,
    totalPages,
  };
}
