CREATE TABLE "reminder_setting" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"email" text,
	"lead_days" integer[] DEFAULT '{7,0}' NOT NULL,
	"last_checked" date,
	"last_sent_at" timestamp with time zone,
	"pending_email" text,
	"pending_code_hash" text,
	"pending_expires" timestamp with time zone,
	"pending_tries" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_setting" ADD CONSTRAINT "reminder_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;