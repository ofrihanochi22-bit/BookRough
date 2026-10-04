-- AlterEnum
-- Alone in its migration: Postgres cannot use a new enum value inside the
-- transaction that adds it (docs/features/communities-membership.md §3.1).
ALTER TYPE "CommunityRole" ADD VALUE 'OWNER';
