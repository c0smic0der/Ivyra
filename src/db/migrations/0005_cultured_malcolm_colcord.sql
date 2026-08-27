ALTER TABLE "predictions" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "stance" text;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "reflection" text;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_stance_check" CHECK ("predictions"."stance" in ('stand_by', 'mixed', 'wouldnt_again'));