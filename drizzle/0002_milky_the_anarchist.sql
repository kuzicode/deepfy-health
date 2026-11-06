CREATE TABLE "waitlist" (
	"email" text PRIMARY KEY NOT NULL,
	"locale" text,
	"agents" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"source" text DEFAULT 'login' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text
);
--> statement-breakpoint
CREATE INDEX "waitlist_status_idx" ON "waitlist" USING btree ("status","created_at");