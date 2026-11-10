-- AlterTable
ALTER TABLE "users" ADD COLUMN     "list_tip_seen_at" TIMESTAMPTZ(3),
ADD COLUMN     "save_tip_seen_at" TIMESTAMPTZ(3),
ADD COLUMN     "walkthrough_seen_at" TIMESTAMPTZ(3);
