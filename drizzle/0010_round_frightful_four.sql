CREATE INDEX "idx_broadcasts_account_created" ON "broadcasts" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_email_batches_account_status" ON "email_batches" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "idx_email_batches_account_created" ON "email_batches" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_email_events_account_created" ON "email_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_emails_domain_id" ON "emails" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "idx_emails_account_created" ON "emails" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_emails_account_status_created" ON "emails" USING btree ("account_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_inbound_attachments_account" ON "inbound_attachments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_domain_id" ON "inbound_emails" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_is_read" ON "inbound_emails" USING btree ("account_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_is_starred" ON "inbound_emails" USING btree ("account_id","is_starred","created_at");--> statement-breakpoint
CREATE INDEX "idx_suppressions_account_created" ON "suppressions" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_webhook_status" ON "webhook_deliveries" USING btree ("webhook_id","status");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_status_retry" ON "webhook_deliveries" USING btree ("status","next_retry_at");