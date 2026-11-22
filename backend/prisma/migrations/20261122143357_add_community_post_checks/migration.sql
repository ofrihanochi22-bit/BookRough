-- AlterTable
ALTER TABLE "users" ADD COLUMN     "community_checks_since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "community_post_checks" (
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_checks_pkey" PRIMARY KEY ("user_id","post_id")
);

-- CreateIndex
CREATE INDEX "community_post_checks_post_id_idx" ON "community_post_checks"("post_id");

-- AddForeignKey
ALTER TABLE "community_post_checks" ADD CONSTRAINT "community_post_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_checks" ADD CONSTRAINT "community_post_checks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
