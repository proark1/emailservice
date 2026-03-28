CREATE TABLE "api_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"api_key_id" uuid,
	"method" varchar(10) NOT NULL,
	"path" varchar(2048) NOT NULL,
	"status_code" integer NOT NULL,
	"response_time" integer,
	"user_agent" varchar(500),
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(998),
	"html_body" text,
	"text_body" text,
	"variables" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_logs_account" ON "api_logs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_api_logs_created" ON "api_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_templates_account" ON "templates" USING btree ("account_id");