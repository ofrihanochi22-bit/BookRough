-- CreateEnum
CREATE TYPE "LinkPlatform" AS ENUM ('BANDCAMP', 'SOUNDCLOUD', 'YOUTUBE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostKind" ADD VALUE 'VIDEO';
ALTER TYPE "PostKind" ADD VALUE 'SET';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "link_platform" "LinkPlatform",
ALTER COLUMN "source_service" DROP NOT NULL;

-- Hand-written: Prisma cannot express these, and `prisma migrate diff` does not
-- see them (docs/features/link-only-posts.md §3.1).
-- A post is either converted from a streaming service or link-only, never both.
ALTER TABLE "posts" ADD CONSTRAINT "posts_one_source"
  CHECK (num_nonnulls("source_service", "link_platform") = 1);
-- A link-only post is never pending and carries no service links.
ALTER TABLE "posts" ADD CONSTRAINT "posts_link_only_unconverted"
  CHECK ("link_platform" IS NULL OR (
    "conversion_pending" = false
    AND "universal_link_spotify" IS NULL
    AND "universal_link_apple" IS NULL
    AND "universal_link_youtube" IS NULL
    AND "universal_link_tidal" IS NULL
    AND "universal_link_deezer" IS NULL));
