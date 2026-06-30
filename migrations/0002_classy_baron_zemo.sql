-- The scalar role column is now the only source of truth. Existing role values
-- are preserved; historical/additional array values are intentionally removed.
ALTER TABLE "users" DROP COLUMN IF EXISTS "user_roles";
