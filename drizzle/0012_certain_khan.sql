CREATE TABLE "household_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rel_path" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_doc" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"content_sha256" text NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_change" ALTER COLUMN "member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_change" ADD COLUMN "scope" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "domains" text[];--> statement-breakpoint
ALTER TABLE "household_attachment" ADD CONSTRAINT "household_attachment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_doc" ADD CONSTRAINT "household_doc_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "household_attachment_user_path_uq" ON "household_attachment" USING btree ("user_id","rel_path");--> statement-breakpoint
CREATE UNIQUE INDEX "household_doc_user_kind_key_uq" ON "household_doc" USING btree ("user_id","kind","key");