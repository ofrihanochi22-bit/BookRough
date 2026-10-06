-- DropIndex
DROP INDEX "ratings_user_id_idx";

-- CreateIndex
CREATE INDEX "ratings_user_id_created_at_id_idx" ON "ratings"("user_id", "created_at" DESC, "id" DESC);
