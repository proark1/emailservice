CREATE TABLE "connected_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"provider" varchar(20) DEFAULT 'custom' NOT NULL,
	"smtp_host" varchar(255) NOT NULL,
	"smtp_port" integer DEFAULT 587 NOT NULL,
	"smtp_secure" boolean DEFAULT false NOT NULL,
	"imap_host" varchar(255) NOT NULL,
	"imap_port" integer DEFAULT 993 NOT NULL,
	"imap_secure" boolean DEFAULT true NOT NULL,
	"username" varchar(255) NOT NULL,
	"encrypted_password" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"error_message" text,
	"last_sync_at" timestamp with time zone,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connected_mailboxes" ADD CONSTRAINT "connected_mailboxes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_connected_mailboxes_account" ON "connected_mailboxes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_connected_mailboxes_email" ON "connected_mailboxes" USING btree ("account_id","email");--> statement-breakpoint
CREATE INDEX "idx_connected_mailboxes_status" ON "connected_mailboxes" USING btree ("status");