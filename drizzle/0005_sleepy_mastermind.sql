CREATE TABLE "catalog_feedback" (
	"name_norm" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"section" text,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
