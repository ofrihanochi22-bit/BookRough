# Feature: Image cleanup reads every tag

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                             |
| ------------- | --------------------------------------------------------------------------- |
| **Use cases** | No new UC. Operations: a fix to the `/vercel-image-cleanup` skill (Phase 6) |
| **Phase**     | 6                                                                           |
| **Branch**    | `fix/image-cleanup-hidden-tags`                                             |
| **Status**    | ☑ Spec approved · ☑ Implemented · ☑ Reviewed · ☑ Tested · ☐ Merged          |

---

## 1. Goal

`/vercel-image-cleanup` never plans to delete an image whose tags it hasn't fully read. Today it can, because the registry table shows at most five tags per image and folds the rest into "+N".

## 2. What happened (evidence)

On 2026-11-23 at 15:35 UTC the cleanup after PR #90 read one image from the table at `vercel.com/bookrough/bookrough/images/api`, with five tags: `4095fb371008 6351269c4ce6 a7efba839776 f401706aefbd f45302f47360`. The row also showed "+1". `read-images.js` matches only the 12-hex tags in the row's text, so it dropped the sixth.

The image's own page lists all six under "Image tags", and the missing one was `f6121df1b4c6`: the commit of the live production deployment (PR #104).

Nothing was deleted, because the image also carried the rollback deployment's tag. But an image that carries **only** hidden tags of remaining deployments would have been planned for deletion. The developer's yes, and the tag check on the image page before each delete, were the only things left between that plan and deleting the live image.

## 3. Scope

**In scope** — the skill's own files in `.claude/skills/vercel-image-cleanup/`:

- **`read-images.js`** reads the "+N" in each row and returns, per image:
  - `hiddenTags` — N, or 0;
  - `tagsComplete` — `hiddenTags === 0`;
- The image page is opened by **clicking the row**, found by one of its visible tags, as step 7 already does. The row is a `role=link` element that navigates by script and has no address to read (found while implementing; the spec first planned a `path` field).
- **New `read-image-tags.js`**, run on an image's own page. It returns:
  - every tag listed under "Image tags";
  - the manifest digest (`sha256:` + 12 hex);
  - the count of tags.
- **`SKILL.md`:**
  - A new step: for each image with `tagsComplete: false`, open its page, run `read-image-tags.js`, and use those tags for the plan and for the Overview snapshot. Check that the page's digest is the row's.
  - **The rule gains a fourth keep:** an image whose full tag list could not be read (the row won't open, digest mismatch, the script fails, or it returns fewer tags than the row showed) is kept, and the report says so.
  - Step 7's existing check on the image page stays.

**Out of scope**

- `prune-deployments`. PR #105 fixed its failure on 2026-11-23 by waiting for the promotion (docs/features/prune-waits-for-promotion.md). The alias-based reading considered in this session is not needed on top of it.
- Any change to how images are deleted (step 7) or approved (step 6).
- Automating the cleanup: Vercel still refuses the registry API on Hobby.

## 4. Data model changes

None.

## 5. API

None. The Overview snapshot keeps its shape (docs/features/admin-overview.md §4.4). Its `tags` are now complete.

## 6. Screens & components

None in the app. The skill's report gains one line per image whose tags were read from its own page, or kept because they couldn't be.

## 7. Edge cases & failure modes

- **"+N" written with a space** ("+ 1", as the accessibility tree shows it) or without one: both are read.
- **More than one image with hidden tags:** each page is opened in turn, in the same tab, and the table is re-read afterwards.
- **The image page is slow to render:** the script waits up to 10 s for "Image tags", like `read-images.js` does for the rows.
- **The page lists more tags than the row showed:** fine. Fewer than the visible ones plus N: keep the image and report it.
- **The layout changes and no "+N" is found while the page has more tags:** not detectable from the table. Step 7's check on the image page still catches it before any delete.

## 8. Test scenarios

The skill's scripts run in the developer's Chrome, not in a test suite: they aren't part of `backend/` or `frontend/`, and CI never runs them. They are verified by hand on the live registry, as before.

- ✅ The current image (`c9f53bec3286`, "+1"): `read-images.js` returns `hiddenTags: 1`, `tagsComplete: false`; `read-image-tags.js` on that page returns six tags, `f6121df1b4c6` among them, and the same digest. **Verified 2026-11-23.**
- ✅ An image with five or fewer tags (`ca0eaf9ffd98`): `hiddenTags: 0`, `tagsComplete: true`, and the plan needs no page visit. **Verified 2026-11-23.**
- ✅ A full cleanup run with these scripts plans to keep the "+1" image because of its hidden tag, even on a reading where the visible tags alone would not have kept it.
- ❌ `read-image-tags.js` run on a page that isn't an image page returns `{ count: 0 }`, and the skill keeps the image. **Verified 2026-11-23** on the repository list page.
- ❌ A digest mismatch between row and page: the skill keeps the image and reports it.
