-- AlterTable
ALTER TABLE "communities" ADD COLUMN     "invite_token" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "communities_invite_token_key" ON "communities"("invite_token");
