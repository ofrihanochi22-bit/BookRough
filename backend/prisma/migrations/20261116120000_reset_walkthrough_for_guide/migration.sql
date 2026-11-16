-- Data only: no schema change (docs/features/onboarding-tutorial.md §3.1).
-- The illustrated guide replaces the five text cards, so everyone who closed
-- the old walkthrough sees the new one once. The two tips did not change and
-- are not reset. Prisma records this migration, so a redeploy never repeats it.
UPDATE "users" SET "walkthrough_seen_at" = NULL WHERE "walkthrough_seen_at" IS NOT NULL;
