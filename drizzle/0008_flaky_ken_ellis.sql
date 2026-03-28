CREATE TABLE "address_book_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"company" varchar(255),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"html_body" text NOT NULL,
	"text_body" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"type" varchar(20) DEFAULT 'custom' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbound_email_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"filename" varchar(500) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"size" integer NOT NULL,
	"storage_path" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "in_reply_to" varchar(500);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "thread_id" varchar(500);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "references" jsonb;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "is_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "thread_id" varchar(500);--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "references" jsonb;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "has_attachments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "address_book_contacts" ADD CONSTRAINT "address_book_contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_attachments" ADD CONSTRAINT "inbound_attachments_inbound_email_id_inbound_emails_id_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_attachments" ADD CONSTRAINT "inbound_attachments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_address_book_account_email" ON "address_book_contacts" USING btree ("account_id","email");--> statement-breakpoint
CREATE INDEX "idx_address_book_account_name" ON "address_book_contacts" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "idx_email_signatures_account" ON "email_signatures" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_folders_account_slug" ON "folders" USING btree ("account_id","slug");--> statement-breakpoint
CREATE INDEX "idx_folders_account" ON "folders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_attachments_email" ON "inbound_attachments" USING btree ("inbound_email_id");--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_emails_folder" ON "emails" USING btree ("account_id","folder_id");--> statement-breakpoint
CREATE INDEX "idx_emails_thread" ON "emails" USING btree ("account_id","thread_id");--> statement-breakpoint
CREATE INDEX "idx_emails_draft" ON "emails" USING btree ("account_id","is_draft");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_folder" ON "inbound_emails" USING btree ("account_id","folder_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_thread" ON "inbound_emails" USING btree ("account_id","thread_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_emails_deleted" ON "inbound_emails" USING btree ("account_id","deleted_at");