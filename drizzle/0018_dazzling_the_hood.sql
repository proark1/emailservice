ALTER TABLE "domains" ADD COLUMN "dmarc_rua_email" varchar(255);--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "send_rate_per_minute" integer;