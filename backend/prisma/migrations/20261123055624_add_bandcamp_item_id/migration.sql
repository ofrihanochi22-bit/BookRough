-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "bandcamp_item_id" VARCHAR(20);

-- Hand-written, invisible to Prisma (in-app-player.md §3, CLAUDE.md §6): the id
-- is digits only, and only on a Bandcamp post.
ALTER TABLE "posts" ADD CONSTRAINT "posts_bandcamp_item_id_shape" CHECK (
  "bandcamp_item_id" IS NULL
  OR ("link_platform" = 'BANDCAMP' AND "bandcamp_item_id" ~ '^[1-9][0-9]{0,19}$')
);
