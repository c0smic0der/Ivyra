CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."prediction_kind" AS ENUM('self', 'world');--> statement-breakpoint
CREATE TYPE "public"."prediction_status" AS ENUM('open', 'resolved', 'void');--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"prediction_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" numeric NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_rates" (
	"kind" text PRIMARY KEY NOT NULL,
	"rate" numeric NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"body_text" text NOT NULL,
	"stats_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"reasoning" text,
	"plan_or_disconfirm" text,
	"prediction_kind" "prediction_kind" NOT NULL,
	"confidence" numeric NOT NULL,
	"resolution_date" date NOT NULL,
	"category" text,
	"reasoning_type" text,
	"embedding" vector(1536),
	"status" "prediction_status" DEFAULT 'open' NOT NULL,
	"outcome" boolean,
	"outcome_note" text,
	"brier_score" numeric,
	"postmortem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"n_resolved" integer DEFAULT 0 NOT NULL,
	"running_brier" numeric,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Row Level Security: owner-only access on user-scoped tables.
-- (The app reads/writes via a privileged DATABASE_URL connection which bypasses
--  RLS; these policies are defense-in-depth for any anon/authenticated JWT access.)
ALTER TABLE "predictions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "insights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "base_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "predictions_owner" ON "predictions" FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "ai_calls_owner" ON "ai_calls" FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "insights_owner" ON "insights" FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
CREATE POLICY "user_stats_owner" ON "user_stats" FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);--> statement-breakpoint
-- base_rates is global reference data: readable by any authenticated user, not writable.
CREATE POLICY "base_rates_read" ON "base_rates" FOR SELECT TO authenticated USING (true);
