CREATE TABLE "warmup_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"email_id" uuid,
	"day" integer NOT NULL,
	"from_address" varchar(255) NOT NULL,
	"to_address" varchar(255) NOT NULL,
	"subject" varchar(998) NOT NULL,
	"opened" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone,
	"replied" boolean DEFAULT false NOT NULL,
	"replied_at" timestamp with time zone,
	"inbox_placement" varchar(20) DEFAULT 'unknown',
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_day" integer DEFAULT 1 NOT NULL,
	"total_days" integer DEFAULT 30 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"target_today" integer DEFAULT 2 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_opens" integer DEFAULT 0 NOT NULL,
	"total_replies" integer DEFAULT 0 NOT NULL,
	"from_address" varchar(255) NOT NULL,
	"ramp_schedule" jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warmup_emails" ADD CONSTRAINT "warmup_emails_schedule_id_warmup_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."warmup_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_emails" ADD CONSTRAINT "warmup_emails_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_schedules" ADD CONSTRAINT "warmup_schedules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_schedules" ADD CONSTRAINT "warmup_schedules_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_warmup_emails_schedule" ON "warmup_emails" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "idx_warmup_emails_account_day" ON "warmup_emails" USING btree ("account_id","day");--> statement-breakpoint
CREATE INDEX "idx_warmup_schedules_account" ON "warmup_schedules" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_warmup_schedules_domain" ON "warmup_schedules" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "idx_warmup_schedules_status" ON "warmup_schedules" USING btree ("status");