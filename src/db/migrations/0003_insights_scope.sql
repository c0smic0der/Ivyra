ALTER TABLE "insights" DROP COLUMN "period";--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "scope" text NOT NULL;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "n_resolved_at_generation" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_scope_unique" UNIQUE("user_id","scope");