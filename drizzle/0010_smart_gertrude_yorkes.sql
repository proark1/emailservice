CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"domain_id" uuid,
	"date" date NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"unique_opened" integer DEFAULT 0 NOT NULL,
	"clicked" integer DEFAULT 0 NOT NULL,
	"unique_clicked" integer DEFAULT 0 NOT NULL,
	"complained" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"domain_id" uuid,
	"target" varchar(255) NOT NULL,
	"target_type" varchar(10) NOT NULL,
	"blacklist_name" varchar(100) NOT NULL,
	"listed" boolean DEFAULT false NOT NULL,
	"listed_reason" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"email" varchar(255) NOT NULL,
	"result" varchar(20) NOT NULL,
	"reason" varchar(50),
	"mx_found" boolean,
	"is_disposable" boolean,
	"is_role_address" boolean,
	"is_free_provider" boolean,
	"suggested_correction" varchar(255),
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"stripe_price_id" varchar(255),
	"monthly_email_limit" integer,
	"domains_limit" integer DEFAULT 1,
	"api_keys_limit" integer DEFAULT 2,
	"templates_limit" integer DEFAULT 10,
	"features" jsonb DEFAULT '{}',
	"rate_limit" integer DEFAULT 60,
	"price" integer DEFAULT 0,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"subject" varchar(998),
	"html_body" text,
	"text_body" text,
	"variables" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "type" varchar(20) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist_checks" ADD CONSTRAINT "blacklist_checks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist_checks" ADD CONSTRAINT "blacklist_checks_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_validations" ADD CONSTRAINT "email_validations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_analytics_snapshots_unique" ON "analytics_snapshots" USING btree ("account_id","domain_id","date");--> statement-breakpoint
CREATE INDEX "idx_analytics_snapshots_account_date" ON "analytics_snapshots" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "idx_blacklist_checks_account" ON "blacklist_checks" USING btree ("account_id","target","checked_at");--> statement-breakpoint
CREATE INDEX "idx_blacklist_checks_domain" ON "blacklist_checks" USING btree ("domain_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_email_validations_email" ON "email_validations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_email_validations_account" ON "email_validations" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_account_id_idx" ON "subscriptions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_template_versions_tid_ver" ON "template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_records_account_date_idx" ON "usage_records" USING btree ("account_id","date");