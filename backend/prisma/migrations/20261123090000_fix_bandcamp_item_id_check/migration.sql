-- Hand-written, invisible to Prisma (in-app-player.md §3, CLAUDE.md §6).
-- Replaces the CHECK from add_bandcamp_item_id: `link_platform = 'BANDCAMP'` is
-- NULL on a converted post, and a CHECK that evaluates to NULL passes, so an id
-- could sit on a converted post. IS NOT DISTINCT FROM is false there instead.
ALTER TABLE "posts" DROP CONSTRAINT "posts_bandcamp_item_id_shape";

ALTER TABLE "posts" ADD CONSTRAINT "posts_bandcamp_item_id_shape" CHECK (
  "bandcamp_item_id" IS NULL
  OR (
    "link_platform" IS NOT DISTINCT FROM 'BANDCAMP'
    AND "bandcamp_item_id" ~ '^[1-9][0-9]{0,19}$'
  )
);
