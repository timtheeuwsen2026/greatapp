CREATE TABLE IF NOT EXISTS "experience_chat_reads" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "experience_id" varchar NOT NULL REFERENCES "experiences"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_read_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "experience_chat_reads_experience_user_unique" UNIQUE("experience_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "experience_chat_reads_user_idx"
  ON "experience_chat_reads" ("user_id");

CREATE INDEX IF NOT EXISTS "experience_messages_experience_created_idx"
  ON "experience_messages" ("experience_id", "created_at");
