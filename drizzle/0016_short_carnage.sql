CREATE TABLE "broadcast_variant_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"variant_id" varchar(20) NOT NULL,
	"contact_id" uuid NOT NULL,
	"email_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"file_name" varchar(255),
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"created_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"column_mapping" jsonb,
	"duplicate_strategy" varchar(20) DEFAULT 'skip',
	"errors" jsonb DEFAULT '[]'::jsonb,
	"csv_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"next_step_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"email_id" uuid,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"delay_minutes" integer DEFAULT 1440 NOT NULL,
	"subject" varchar(998),
	"html_body" text,
	"text_body" text,
	"template_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"from_address" varchar(255) NOT NULL,
	"from_name" varchar(255),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"trigger_type" varchar(20) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "ab_test_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "ab_test_config" jsonb;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "ab_test_status" varchar(20);--> statement-breakpoint
ALTER TABLE "broadcast_variant_sends" ADD CONSTRAINT "broadcast_variant_sends_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_variant_sends" ADD CONSTRAINT "broadcast_variant_sends_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_variant_sends" ADD CONSTRAINT "broadcast_variant_sends_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_imports" ADD CONSTRAINT "contact_imports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_imports" ADD CONSTRAINT "contact_imports_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_sends" ADD CONSTRAINT "sequence_sends_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_sends" ADD CONSTRAINT "sequence_sends_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_sends" ADD CONSTRAINT "sequence_sends_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_broadcast_variant_sends_broadcast" ON "broadcast_variant_sends" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "idx_broadcast_variant_sends_broadcast_variant" ON "broadcast_variant_sends" USING btree ("broadcast_id","variant_id");--> statement-breakpoint
CREATE INDEX "idx_contact_imports_account_id" ON "contact_imports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_contact_imports_account_status" ON "contact_imports" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "idx_sequence_enrollments_sequence" ON "sequence_enrollments" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "idx_sequence_enrollments_status_next" ON "sequence_enrollments" USING btree ("status","next_step_at");--> statement-breakpoint
CREATE INDEX "idx_sequence_enrollments_contact" ON "sequence_enrollments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_sequence_sends_enrollment" ON "sequence_sends" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "idx_sequence_sends_step" ON "sequence_sends" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "idx_sequence_steps_sequence_id" ON "sequence_steps" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "idx_sequence_steps_sequence_position" ON "sequence_steps" USING btree ("sequence_id","position");--> statement-breakpoint
CREATE INDEX "idx_sequences_account_id" ON "sequences" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_sequences_account_status" ON "sequences" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "idx_sequences_audience_trigger" ON "sequences" USING btree ("audience_id","trigger_type","status");