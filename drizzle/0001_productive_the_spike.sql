CREATE TABLE "allowed_email" (
	"email" text PRIMARY KEY NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_status" (
	"user_id" text PRIMARY KEY NOT NULL,
	"disabled_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "user_status" ADD CONSTRAINT "user_status_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;