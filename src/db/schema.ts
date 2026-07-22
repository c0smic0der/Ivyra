import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

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
});

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
export const insights = pgTable("insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  period: text("period").notNull(),
  bodyText: text("body_text").notNull(),
  statsJson: jsonb("stats_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
