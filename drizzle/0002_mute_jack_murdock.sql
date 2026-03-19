ALTER TABLE "emails" DROP CONSTRAINT "emails_domain_id_domains_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_emails" DROP CONSTRAINT "inbound_emails_domain_id_domains_id_fk";
--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;