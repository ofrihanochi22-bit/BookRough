-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "friends" (
    "requester_id" UUID NOT NULL,
    "addressee_id" UUID NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("requester_id","addressee_id")
);

-- CreateIndex
CREATE INDEX "friends_addressee_id_status_created_at_idx" ON "friends"("addressee_id", "status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express these, and `prisma migrate diff` does not
-- see them (docs/features/friend-requests.md §3). One row per pair, whichever
-- direction it was sent in; nobody befriends themselves.
CREATE UNIQUE INDEX "friends_one_per_pair"
  ON "friends" (LEAST("requester_id", "addressee_id"), GREATEST("requester_id", "addressee_id"));
ALTER TABLE "friends" ADD CONSTRAINT "friends_not_self" CHECK ("requester_id" <> "addressee_id");
