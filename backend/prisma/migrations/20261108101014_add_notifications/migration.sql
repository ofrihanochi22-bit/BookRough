-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMMUNITY_POSTS', 'RECOMMENDATION', 'RATING', 'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'COMMUNITY_INVITATION');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "community_id" UUID,
    "post_id" UUID,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_updated_at_id_idx" ON "notifications"("user_id", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_actor_id_idx" ON "notifications"("actor_id");

-- CreateIndex
CREATE INDEX "notifications_post_id_idx" ON "notifications"("post_id");

-- CreateIndex
CREATE INDEX "notifications_community_id_idx" ON "notifications"("community_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express these, and `prisma migrate diff` does not
-- see them (docs/features/notifications.md §3).
-- At most one unread COMMUNITY_POSTS group per reader and community; the target
-- of the grouping upsert in notification.service.ts.
CREATE UNIQUE INDEX "notifications_one_open_group"
  ON "notifications" ("user_id", "community_id")
  WHERE "type" = 'COMMUNITY_POSTS' AND "read_at" IS NULL;
-- A group never counts fewer than one post.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_count_positive"
  CHECK ("count" >= 1);
