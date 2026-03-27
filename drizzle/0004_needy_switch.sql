CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"from_address" varchar(255) NOT NULL,
	"from_name" varchar(255),
	"subject" varchar(998) NOT NULL,
	"html_body" text,
	"text_body" text,
	"reply_to" jsonb,
	"headers" jsonb,
	"tags" jsonb,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_broadcasts_account_id" ON "broadcasts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_broadcasts_account_status" ON "broadcasts" USING btree ("account_id","status");