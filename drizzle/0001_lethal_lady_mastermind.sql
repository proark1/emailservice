CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"domain_id" uuid,
	"from_address" varchar(255) NOT NULL,
	"from_name" varchar(255),
	"to_address" varchar(255) NOT NULL,
	"cc_addresses" jsonb,
	"subject" varchar(998) NOT NULL,
	"text_body" text,
	"html_body" text,
	"headers" jsonb,
	"message_id" varchar(500),
	"in_reply_to" varchar(500),
	"is_read" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_account" ON "inbound_emails" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_to" ON "inbound_emails" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_created" ON "inbound_emails" USING btree ("account_id","created_at");