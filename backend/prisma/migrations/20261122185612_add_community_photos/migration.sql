-- AlterTable
ALTER TABLE "communities" ADD COLUMN     "photo_updated_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "community_photos" (
    "community_id" UUID NOT NULL,
    "image" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_photos_pkey" PRIMARY KEY ("community_id")
);

-- AddForeignKey
ALTER TABLE "community_photos" ADD CONSTRAINT "community_photos_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
