-- CreateTable
CREATE TABLE "community_invitations" (
    "community_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_invitations_pkey" PRIMARY KEY ("community_id","user_id")
);

-- CreateIndex
CREATE INDEX "community_invitations_user_id_created_at_idx" ON "community_invitations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "community_invitations_invited_by_id_idx" ON "community_invitations"("invited_by_id");

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invitations" ADD CONSTRAINT "community_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
