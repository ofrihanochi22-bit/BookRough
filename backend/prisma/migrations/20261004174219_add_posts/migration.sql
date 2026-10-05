-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('TRACK', 'ALBUM');

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "community_id" UUID NOT NULL,
    "original_url" VARCHAR(2048) NOT NULL,
    "source_service" "StreamingService" NOT NULL,
    "kind" "PostKind",
    "song_title" VARCHAR(300),
    "song_artist" VARCHAR(300),
    "song_cover_art_url" VARCHAR(2048),
    "universal_link_spotify" VARCHAR(2048),
    "universal_link_apple" VARCHAR(2048),
    "universal_link_youtube" VARCHAR(2048),
    "universal_link_tidal" VARCHAR(2048),
    "universal_link_deezer" VARCHAR(2048),
    "text_comment" TEXT,
    "conversion_pending" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_community_id_created_at_id_idx" ON "posts"("community_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_author_id_community_id_idx" ON "posts"("author_id", "community_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
