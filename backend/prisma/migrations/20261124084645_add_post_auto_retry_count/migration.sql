-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "auto_retry_count" INTEGER NOT NULL DEFAULT 0;

-- Hand-written (Prisma cannot express a CHECK): at most four automatic
-- conversion attempts per post (docs/features/conversion-auto-retry.md §3).
ALTER TABLE "posts" ADD CONSTRAINT "posts_auto_retry_count_range"
  CHECK ("auto_retry_count" BETWEEN 0 AND 4);
