ALTER TABLE "emails" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "failure_code" varchar(32);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;