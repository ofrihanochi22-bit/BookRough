-- CreateEnum
CREATE TYPE "StreamingService" AS ENUM ('SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'TIDAL', 'DEEZER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "google_sub" TEXT NOT NULL,
    "display_name" VARCHAR(50),
    "display_name_key" VARCHAR(50),
    "profile_picture_url" TEXT,
    "preferred_service" "StreamingService",
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_display_name_key_key" ON "users"("display_name_key");
