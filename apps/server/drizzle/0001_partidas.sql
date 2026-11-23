CREATE TABLE "match_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"tick" integer NOT NULL,
	"t" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"character" jsonb NOT NULL,
	"district" smallint NOT NULL,
	"gender" text NOT NULL,
	"place" smallint,
	"cause" text,
	"eliminated_at_ms" integer
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"seed" text NOT NULL,
	"status" text NOT NULL,
	"config" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"winner_participant_id" uuid
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_participant_id_room_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "me_match_idx" ON "match_events" USING btree ("match_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "mp_pk" ON "match_participants" USING btree ("match_id","participant_id");--> statement-breakpoint
CREATE INDEX "mp_user_idx" ON "match_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "matches_room_idx" ON "matches" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_active_uq" ON "matches" USING btree ("room_id") WHERE status <> 'terminada';