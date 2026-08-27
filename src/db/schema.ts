import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { stanceValues } from "../lib/predictions/stance";

// Enums ---------------------------------------------------------------------
export const predictionKind = pgEnum("prediction_kind", ["self", "world"]);
export const predictionStatus = pgEnum("prediction_status", [
  "open",
  "resolved",
  "void",
]);

// predictions ---------------------------------------------------------------
// Resolution criteria + reasoning FREEZE at creation (enforced in app logic).
export const predictions = pgTable("predictions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  text: text("text").notNull(),
  reasoning: text("reasoning"),
  planOrDisconfirm: text("plan_or_disconfirm"),
  predictionKind: predictionKind("prediction_kind").notNull(),
  confidence: numeric("confidence").notNull(),
  resolutionDate: date("resolution_date").notNull(),
  category: text("category"),
  reasoningType: text("reasoning_type"),
  embedding: vector("embedding", { dimensions: 1536 }),
  status: predictionStatus("status").notNull().default("open"),
  outcome: boolean("outcome"),
  outcomeNote: text("outcome_note"),
  brierScore: numeric("brier_score"),
  postmortem: text("postmortem"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  // Set by the reminders cron once a due-today email has gone out for this
  // row, so a repeated/retried invocation doesn't re-email the same user.
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  // --- decision layer (nullable, un-backfilled; null is the correct historic
  // value for every existing row). A *decision* entry records a commitment to
  // the user's own action (vs a plain forecast); `stance` is the post-outcome
  // read; `reflection` is free text. A non-null `decision` forces
  // prediction_kind 'self' at write time — see kindFor.
  decision: text("decision"),
  stance: text("stance", { enum: stanceValues }),
  reflection: text("reflection"),
}, (t) => [
  // DB-level guard mirroring the `stance` TS union, built from stanceValues so
  // the allowed set can never drift from the type (one source, two consumers).
  check(
    "predictions_stance_check",
    sql`${t.stance} in (${sql.raw(stanceValues.map((v) => `'${v}'`).join(", "))})`,
  ),
]);

// ai_calls ------------------------------------------------------------------
// Every LLM call is logged here (tokens, cost, latency).
export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  predictionId: uuid("prediction_id"),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: numeric("cost_usd").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// insights ------------------------------------------------------------------
// One cached AI insight per (user, scope). Generated on demand, never on a
// schedule. `nResolvedAtGeneration` is the resolved-non-void count the body was
// written against, so the page can mark a cached insight out of date the moment
// a new resolution lands (see scopedInsightView.insightFreshness).
export const insights = pgTable(
  "insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    // 'recent' (the last ROLLING_WINDOW resolutions) | 'lifetime' (all resolved)
    // | 'category:<category>'.
    scope: text("scope").notNull(),
    nResolvedAtGeneration: integer("n_resolved_at_generation").notNull(),
    // The SCOPED_INSIGHT_PROMPT_VERSION the body was generated under. A cached
    // insight behind the current code version is treated as stale so prompt
    // improvements reach existing users. Defaults to 0 (the pre-versioning
    // contract) so rows created before this column existed read as stale.
    promptVersion: integer("prompt_version").notNull().default(0),
    bodyText: text("body_text").notNull(),
    statsJson: jsonb("stats_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("insights_user_scope_unique").on(table.userId, table.scope)],
);

// base_rates ----------------------------------------------------------------
// Global reference data (not user-scoped).
export const baseRates = pgTable("base_rates", {
  kind: text("kind").primaryKey(),
  rate: numeric("rate").notNull(),
  description: text("description"),
});

// user_stats ----------------------------------------------------------------
export const userStats = pgTable("user_stats", {
  userId: uuid("user_id").primaryKey(),
  nResolved: integer("n_resolved").notNull().default(0),
  runningBrier: numeric("running_brier"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
