CREATE TABLE "provider_google_meet_connections" (
	"provider_id" text PRIMARY KEY NOT NULL,
	"google_account_id" text NOT NULL,
	"email" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "meeting_space_name" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "meeting_creating_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_google_meet_connections" ADD CONSTRAINT "provider_google_meet_connections_provider_id_provider_profiles_user_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("user_id") ON DELETE cascade ON UPDATE no action;