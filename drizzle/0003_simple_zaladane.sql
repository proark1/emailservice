ALTER TABLE "domains" ADD COLUMN "dns_provider" varchar(20);--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "dns_provider_key" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "dns_provider_secret" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "dns_provider_zone_id" varchar(255);