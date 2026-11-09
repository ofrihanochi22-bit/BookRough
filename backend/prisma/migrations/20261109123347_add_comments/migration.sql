-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_REPLY';

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "rating_id" UUID,
    "parent_id" UUID,
    "reply_to_id" UUID,
    "body" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_rating_id_idx" ON "comments"("rating_id");

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_rating_id_fkey" FOREIGN KEY ("rating_id") REFERENCES "ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express these, and `prisma migrate diff` does not
-- see them (docs/features/discussion-threads.md §3).
-- A reply belongs to one thread at most: a review's or a post comment's.
ALTER TABLE "comments" ADD CONSTRAINT "comments_one_thread"
  CHECK (num_nonnulls("rating_id", "parent_id") <= 1);
-- Only a deleted comment (kept for its replies) has no body.
ALTER TABLE "comments" ADD CONSTRAINT "comments_body_or_deleted"
  CHECK ("body" IS NOT NULL OR "deleted_at" IS NOT NULL);
-- The COMMENT_REPLY group index is in the next migration: a new enum value
-- cannot be used in the transaction that adds it.
