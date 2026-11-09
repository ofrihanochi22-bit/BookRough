-- Hand-written (docs/features/discussion-threads.md §3): at most one unread
-- COMMENT_REPLY group per reader and post — the target of the grouping upsert
-- in notification.service.ts. Separate from add_comments because a new enum
-- value cannot be used in the transaction that adds it.
CREATE UNIQUE INDEX "notifications_one_open_reply_group"
  ON "notifications" ("user_id", "post_id")
  WHERE "type" = 'COMMENT_REPLY' AND "read_at" IS NULL;
