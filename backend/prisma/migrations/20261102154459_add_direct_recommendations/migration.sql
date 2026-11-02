-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "recipient_hidden_at" TIMESTAMPTZ(3),
ADD COLUMN     "recipient_id" UUID,
ALTER COLUMN "community_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "recommendations_seen_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "posts_recipient_id_created_at_id_idx" ON "posts"("recipient_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_author_id_created_at_id_idx" ON "posts"("author_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express these, and `prisma migrate diff` does not
-- see them (docs/features/direct-recommendations.md §3.1).
-- A post has exactly one target.
ALTER TABLE "posts" ADD CONSTRAINT "posts_one_target"
  CHECK (num_nonnulls("community_id", "recipient_id") = 1);
-- Nobody sends a recommendation to themselves.
ALTER TABLE "posts" ADD CONSTRAINT "posts_not_self" CHECK ("author_id" <> "recipient_id");