ALTER TABLE "emails" ADD COLUMN "tracking_opens" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "tracking_clicks" boolean DEFAULT true NOT NULL;
