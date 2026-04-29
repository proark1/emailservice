ALTER TABLE "suppressions" DROP CONSTRAINT "suppressions_source_email_id_emails_id_fk";
--> statement-breakpoint
-- Drop the old default first so we can alter the type, then re-set it as a real boolean.
-- The USING clause performs the data cast — Postgres can't auto-coerce
-- text "true"/"false" to boolean without one.
ALTER TABLE "company_members" ALTER COLUMN "provisioned" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "company_members" ALTER COLUMN "provisioned" SET DATA TYPE boolean USING ("provisioned" = 'true');--> statement-breakpoint
ALTER TABLE "company_members" ALTER COLUMN "provisioned" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_source_email_id_emails_id_fk" FOREIGN KEY ("source_email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_expires_at" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_created" ON "webhook_deliveries" USING btree ("created_at");