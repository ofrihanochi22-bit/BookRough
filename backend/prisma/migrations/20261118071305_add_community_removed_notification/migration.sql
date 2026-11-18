-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_REMOVED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "community_name" VARCHAR(100);

-- Hand-written: Prisma cannot express this, and `prisma migrate diff` does not
-- see it (docs/features/admin-delete.md §3). A COMMUNITY_REMOVED row carries the
-- deleted community's name and points at no community or post; every other type
-- carries no name. Compared as text, because Postgres refuses a new enum value
-- in the transaction that added it.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_removed_shape" CHECK (
  ("type"::text = 'COMMUNITY_REMOVED') = ("community_name" IS NOT NULL)
  AND ("type"::text <> 'COMMUNITY_REMOVED' OR ("community_id" IS NULL AND "post_id" IS NULL))
);
