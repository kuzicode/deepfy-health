CREATE TABLE "agent_change" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"member_id" text NOT NULL,
	"token_id" text,
	"token_name" text NOT NULL,
	"tool" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"prev_ciphertext" text,
	"prev_sha256" text,
	"new_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "scope" text DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_change" ADD CONSTRAINT "agent_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_change" ADD CONSTRAINT "agent_change_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_change_user_created_idx" ON "agent_change" USING btree ("user_id","created_at");