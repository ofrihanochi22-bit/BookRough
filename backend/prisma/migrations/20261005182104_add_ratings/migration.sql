-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ratings_user_id_idx" ON "ratings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_post_id_user_id_key" ON "ratings"("post_id", "user_id");

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express a CHECK (docs/features/rate-post.md §3).
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 10);
