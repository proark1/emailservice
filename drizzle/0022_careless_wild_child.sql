CREATE TABLE "contact_topic_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"subscribed" boolean NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preference_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"default_subscribed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tls_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid,
	"domain_name" varchar(255) NOT NULL,
	"organization_name" varchar(255),
	"report_id" varchar(255),
	"contact_info" varchar(512),
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"policy_type" varchar(32) NOT NULL,
	"policy_string" jsonb,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"failure_details" jsonb,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sunset_policy_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sunset_policy_days" integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sunset_policy_min_emails" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "bimi_logo_url" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "bimi_vmc_url" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "bimi_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "mta_sts_mode" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "mta_sts_policy_id" varchar(64);--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "tls_rpt_rua_email" varchar(255);--> statement-breakpoint
ALTER TABLE "contact_topic_subscriptions" ADD CONSTRAINT "contact_topic_subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_topic_subscriptions" ADD CONSTRAINT "contact_topic_subscriptions_topic_id_preference_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."preference_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_topics" ADD CONSTRAINT "preference_topics_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tls_reports" ADD CONSTRAINT "tls_reports_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_contact_topic_unique" ON "contact_topic_subscriptions" USING btree ("contact_id","topic_id");--> statement-breakpoint
CREATE INDEX "idx_contact_topic_topic" ON "contact_topic_subscriptions" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_preference_topics_audience_key" ON "preference_topics" USING btree ("audience_id","key");--> statement-breakpoint
CREATE INDEX "idx_tls_reports_domain" ON "tls_reports" USING btree ("domain_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tls_reports_domain_name" ON "tls_reports" USING btree ("domain_name");