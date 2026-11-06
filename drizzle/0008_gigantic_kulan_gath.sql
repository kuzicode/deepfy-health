CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text,
	"kind" text DEFAULT 'idea' NOT NULL,
	"body" text NOT NULL,
	"page" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"digested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ops_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_pending_idx" ON "feedback" USING btree ("digested_at","created_at");