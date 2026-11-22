-- D2: Hide becomes Archive (docs/features/archive-recommendations.md §3).
-- Written by hand: Prisma would drop the column and add a new one, losing
-- every hidden row. A rename keeps them, so each one is archived.
ALTER TABLE "posts" RENAME COLUMN "recipient_hidden_at" TO "recipient_archived_at";
