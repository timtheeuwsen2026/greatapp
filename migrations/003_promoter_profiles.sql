CREATE TABLE IF NOT EXISTS "promoter_profiles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL UNIQUE REFERENCES "users"("id"),
  "profile_photo" varchar,
  "display_name" varchar NOT NULL,
  "bio" text NOT NULL,
  "completed" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
