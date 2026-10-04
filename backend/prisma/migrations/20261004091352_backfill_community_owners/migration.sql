-- Backfill: each existing community's earliest-joined admin becomes its owner
-- (docs/features/communities-membership.md §3.1). Ties go to the lower user id.
UPDATE "community_members" AS m
SET "role" = 'OWNER'
FROM (
    SELECT DISTINCT ON ("community_id") "community_id", "user_id"
    FROM "community_members"
    WHERE "role" = 'ADMIN'
    ORDER BY "community_id", "joined_at", "user_id"
) AS first_admin
WHERE m."community_id" = first_admin."community_id"
  AND m."user_id" = first_admin."user_id";

-- Exactly one owner per community. Hand-written: Prisma's schema language
-- cannot express a partial index (the CLAUDE.md §4 exception).
CREATE UNIQUE INDEX "community_members_one_owner" ON "community_members" ("community_id") WHERE "role" = 'OWNER';

-- CreateTable
CREATE TABLE "community_bans" (
    "community_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "banned_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_bans_pkey" PRIMARY KEY ("community_id","user_id")
);

-- AddForeignKey
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_banned_by_id_fkey" FOREIGN KEY ("banned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
