# Feature: <name>

> Produced in Stage 1 of the feature session (CLAUDE.md §15). Approved by the developer before implementation starts.
> Markdown only — feature specs have no `.docx` companion (CLAUDE.md §14.2).

|               |                                                                    |
| ------------- | ------------------------------------------------------------------ |
| **Use cases** | UC-?                                                               |
| **Phase**     | ?                                                                  |
| **Branch**    | `feat/<kebab-name>`                                                |
| **Status**    | ☐ Spec approved · ☐ Implemented · ☐ Reviewed · ☐ Tested · ☐ Merged |

---

## 1. Goal

One paragraph: what the user can do after this ships that they could not do before.

## 2. Scope

**In scope**

- …

**Out of scope** — state this explicitly, it is the most useful part of the document

- …

## 3. Data model changes

Tables added or columns altered, with types, nullability, defaults, indexes, and foreign keys.
Name the migration: `npx prisma migrate dev --name <descriptive-name>`.

If there are no schema changes, write "None" — do not delete the section.

## 4. API

For each endpoint:

### `METHOD /api/...`

- **Auth:** required / public / admin-only
- **Request:** body and params, with the Zod schema shape
- **Success:** status code and `data` payload shape
- **Errors:** every code this endpoint can return and what triggers each

## 5. Screens & components

Which screens from `docs/frontend screens.md` are added or changed, and for each:

- The layout at phone width first (CLAUDE.md §8)
- Loading state
- Empty state
- Error state

## 6. Edge cases & failure modes

What happens when the input is malformed, the resource was deleted between load and action, the user lacks permission, two users act at once, or the network drops mid-request.

## 7. Test scenarios

The list Stage 4 turns directly into tests. Name each one individually — a scenario that is not written here will not be tested.

**Unit (services)**

- ✅ Happy: …
- ❌ Bad: …

**Integration (endpoints)**

- ✅ 2xx: …
- ❌ 400/422 invalid payload: …
- ❌ 401 unauthenticated: …
- ❌ 403 wrong permissions: …
- ❌ 404 missing resource: …

**Component**

- ✅ Renders with data: …
- ❌ Shows validation error: …

**E2E** — only if this feature is part of a golden loop

- …

## 8. Open questions

Anything unresolved at approval time, and who decides it. Empty at approval means nothing is unresolved.

## 9. Decisions log

Filled in as implementation proceeds. Record any place where reality forced a change to this spec, and why — so the document and the code never disagree.

| Date | Decision | Reason |
| ---- | -------- | ------ |
|      |          |        |
