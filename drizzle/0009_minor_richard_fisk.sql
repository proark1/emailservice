CREATE TABLE "domain_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"mailboxes" jsonb,
	"invited_by" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "domain_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"mailboxes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_invitations" ADD CONSTRAINT "domain_invitations_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_invitations" ADD CONSTRAINT "domain_invitations_invited_by_accounts_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_members" ADD CONSTRAINT "domain_members_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_members" ADD CONSTRAINT "domain_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_domain_invitations_domain" ON "domain_invitations" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "idx_domain_invitations_email" ON "domain_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_domain_invitations_token" ON "domain_invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_domain_members_unique" ON "domain_members" USING btree ("domain_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_domain_members_account" ON "domain_members" USING btree ("account_id");