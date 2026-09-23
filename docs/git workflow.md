### Git Workflow & Conventions Specification

### 1. Core Philosophy

The primary goal of this workflow is maintainability and traceability. Every commit should tell a clear story of what changed and why, and the main branch must always remain in a stable, deployable state.

### 1.1. Division of Responsibility

**Claude owns every git and GitHub operation in this project. The developer runs no git commands.**

The split is by *decision* versus *execution*: the developer decides **when** a branch may be merged or deleted, and Claude carries out everything else.

| Responsibility | Owner |
|---|---|
| Creating and switching branches | Claude |
| Staging and committing | Claude |
| Writing commit messages | Claude |
| Pushing to the remote | Claude |
| Opening the Pull Request and writing its description | Claude |
| Reviewing the diff before merge | Claude (Stage 3 self-review) |
| **Deciding when to merge or delete a branch** | **Developer** |
| Performing the merge | Claude |
| Deleting the merged branch, locally and remotely | Claude |
| Returning to an updated `main` | Claude |

Four rules follow from this.

**Claude never instructs the developer to run a git command.** It runs the command itself. Work left uncommitted at the end of a step is a failure on Claude's part, not a handoff.

**Claude never merges on its own initiative.** An open Pull Request waits until the developer says to merge it. Auto-merge is never enabled, and nothing is ever pushed directly to `main`.

**A red or pending CI check blocks the merge even when the developer has said to merge.** Once `pr.yml` exists, Claude reports the failure and fixes it rather than merging through it. This is the last automated gate in the process and it is not negotiable.

**An unmerged branch is never deleted without an explicit instruction**, because the work would be lost.

### 1.2. What This Arrangement Gives Up

Under the original workflow the developer reviewed the "Files Changed" tab before clicking Merge, and that human read was the one gate no automated check could replace: it catches work that is technically correct but wrong for the product.

That gate has been **deliberately removed** by the developer in favour of speed on a solo project. What remains is Claude's Stage 3 review pass (`CLAUDE.md` section 15) and the CI suite.

The consequence is that the self-review matters **more** than it did before, not less. Treat the Stage 3 pass and the bad-path test requirements as load-bearing, because nothing downstream will catch what they miss.

### 1.3. The Routine, and Everything Outside It

Claude runs the routine without asking. The routine is exactly what the feature cycle needs:

`checkout -b` · `add` · `commit` · `push` · `gh pr create` · `gh pr edit` · `gh pr view` · `gh pr checks` · `gh pr merge` (on the developer's word) · `branch -d` on a merged branch · `fetch` · `pull` · `prune` · `status` / `log` / `diff`

**Everything else requires a question first, even when the answer is obviously yes.** The asymmetry is the point: a one-line question costs seconds, an unrequested history rewrite costs an afternoon. The categories:

| Category | Examples |
|---|---|
| Rewriting history | `rebase`, `commit --amend`, `push --force`, `reset --hard`, `cherry-pick`, `revert` |
| Bypassing a gate | `--no-verify`, `gh pr merge --admin`, skipping a required check |
| Deleting | unmerged branch, tag, release, remote ref, bulk file removal |
| Repository settings | branch protection, visibility, collaborators, webhooks, Actions permissions, default branch |
| Toolchain | adding, removing or upgrading a dependency; changing Node or Postgres versions; altering the Docker base image |
| Secrets | anything touching a live credential |

Claude states what the command does and why in one or two lines, then waits.

### 1.4. Secrets Are the Developer's

The developer runs no commands, with one standing exception: **anything involving a real secret value**. Claude never sees, types, stores, or transmits a live credential.

The developer personally handles GitHub Actions repository secrets, environment variables at the hosting provider (`DATABASE_URL`, `JWT_SECRET`), and the Google Cloud Console OAuth client.

Claude's job is to say exactly which key is needed, where it goes, and how to generate it - then stop. Claude writes `.env.example` files with blank or obviously fake values, never a populated `.env`.

### 1.5. Merge Conflicts

The workflow is built so conflicts stay rare: one feature, one branch, merged and deleted before the next begins. `main` does not move while a branch is open, because nothing else is in flight.

When a conflict happens anyway, **Claude does not resolve it silently.** Claude describes it briefly - which files, which two changes are in tension, what each side would mean - and the developer decides. Claude then executes that decision.

One exception: conflicts in generated or mirrored files (a `.docx` mirror of a spec, a lockfile) are resolved by regenerating from source rather than hand-merging. Claude says when it has done this.

### 2. Branching Strategy

We will use a streamlined **Feature Branch Workflow**. This avoids the heavy overhead of full GitFlow while providing enough structure to keep vertical slices isolated until they are complete.

### The main Branch

- **Purpose:** The single source of truth. The code in main should always be fully functional and ready for deployment.
- **Rule:NEVER** commit directly to main. All changes must be merged in via a Pull Request (PR).

### Branch Naming Conventions

All branches created off main must follow a strict naming prefix indicating the type of work being done, followed by a short, descriptive, kebab-case name.
- **feat/**: For a new feature or vertical slice (e.g., feat/google-oauth, feat/community-creation).
- **fix/**: For bug fixes (e.g., fix/login-crash, fix/scraper-timeout).
- **refactor/**: For code changes that neither fix a bug nor add a feature, but improve structure (e.g., refactor/api-routes).
- **docs/**: For documentation updates (e.g., docs/readme-setup).
- **chore/**: For routine tasks, dependencies, or configuration changes (e.g., chore/update-playwright, chore/docker-setup).

### Example Flow:

Bash

# Ensure you are on main and up to date

git checkout main
git pull

# Create a new branch for the vertical slice

git checkout -b feat/bookmark-songs

### 3. Commit Message Conventions

We will strictly adhere to the **Conventional Commits** specification. This makes the Git history highly readable and allows for automated changelog generation in the future.

### Format

Plaintext
<type>(<optional scope>): <description>

[optional body explaining the "why"]

### Types

- **feat:** A new feature (correlates with feat/ branch).
- **fix:** A bug fix (correlates with fix/ branch).
- **docs:** Documentation only changes.
- **style:** Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc).
- **refactor:** A code change that neither fixes a bug nor adds a feature.
- **test:** Adding missing tests or correcting existing tests.
- **chore:** Changes to the build process or auxiliary tools and libraries.

### Examples

- Good: feat(auth): implement google oauth token verification
- Good: fix(scraper): add timeout handling for dom loading
- Good: chore: configure dockerfile for node backend
- Bad: added login
- Bad: fixed a bug
- Bad: WIP

### Enforcement

This convention is not a matter of discipline. A **commitlint** commit-msg hook, installed through Husky, rejects any message that does not parse as a valid Conventional Commit. If a commit is rejected, fix the message. **Bypassing the hook with `--no-verify` is not permitted** — if the hook is wrong, fix the hook configuration in its own commit.

A **pre-commit** hook additionally runs ESLint and Prettier over the staged files only, so formatting and lint violations never reach a review.

### 4. The Pull Request (PR) Workflow

Even as a solo developer, enforcing a strict PR process is critical for self-review. It forces you to step back, look at the aggregate diff, and catch mistakes (like leaving console.log() statements) before they pollute the main branch.

### Step-by-Step PR Process

- **Commit Often (Claude):** While working on the feat/ branch, make small, atomic commits.
- **Push (Claude):** Push the feature branch to the remote repository.
git push -u origin feat/bookmark-songs
- **Open PR (Claude):** Open a Pull Request on GitHub merging feat/bookmark-songs into main, with the description template below filled in.
- **Wait for CI:** The `pr.yml` workflow must be green — lint, typecheck, unit tests, integration tests. A red CI blocks the merge through branch protection, and the fix is Claude's responsibility.
- **Self-review (Claude):** Go through the full diff line-by-line before asking for the merge. Check for:
  - Clean, readable code.
  - No leftover debugging code (console.log, commented-out blocks).
  - Proper error handling.
  - That the feature actually matches what was agreed in its specification.
- **Wait (Developer decides):** The PR stays open until the developer says to merge it. Claude does not merge on its own initiative.
- **Merge (Claude):** On the developer's word, and only with CI green, **squash and merge** into main. Squashing keeps one well-formed Conventional Commit per feature on main, so the history reads as a list of delivered capabilities rather than a transcript of the work.
- **Clean Up (Claude):** Immediately after merging, delete the feature branch locally and remotely and check out an updated main. This does not need a second instruction.

### PR Description Template

To maintain thorough project documentation, use this lightweight template in the body of your Pull Requests:
Markdown

## Objective

[Briefly describe what this PR accomplishes. E.g., "Implements UC-1: User Registration via Google Sign-In."]

## Changes Made

- Added `users` table migration.
- Created POST `/api/auth/google` endpoint.
- Built the Welcome screen and the Complete Your Profile onboarding screen.

## Testing Performed

- [x] Tested first sign-in creating a new account.
- [x] Tested duplicate username error handling.
- [x] Tested invalid Google token returning 401.
- [x] Verified database row creation.

## Notes for Review

[Any technical debt added, or specific architectural choices made that should be documented.]

### 5. Working in Vertical Slices

Because you are working vertically, your Git workflow should naturally follow the implementation order we established.
For example, when tackling **Phase 2: Core Social Structures**, your Git history might look like this:
- git checkout -b feat/community-db-schema
- Work... git commit -m "feat(db): create communities and members tables"
- Work... git commit -m "feat(api): add post route for creating communities"
- Work... git commit -m "feat(ui): build create community react component"
- Push, open PR, self-review, and merge.
- Start the next slice: git checkout -b feat/community-invite-links
This ensures that every time you merge to main, you are delivering a complete, functional slice of the application spanning from the database up to the user interface.

**One slice at a time.** Do not open a second feature branch while the previous Pull Request is still unmerged. Parallel slices in a one-developer project produce merge conflicts and half-finished work with no corresponding gain in throughput.

### 6. Branch Protection

`main` is protected on GitHub with the following rules, so the workflow above is enforced by the platform rather than by memory:

- Direct pushes to `main` are blocked.
- A Pull Request is required to merge.
- The `pr.yml` status checks — lint, typecheck, unit, integration — must pass before merging.
- The branch must be up to date with `main` before merging.
- Squash-and-merge is the only permitted merge method.

### 7. Relationship to the Feature Session

The Git workflow is the final stage of the four-stage feature session defined in `CLAUDE.md` §15: specification, implementation, review and improvement, tests. **A branch is not pushed and a Pull Request is not opened until all four stages are complete and the test suite is green.**

Concretely, the commit sequence on a feature branch will usually look like:

- `feat(db): add bookmarks table and migration`
- `feat(api): add bookmark create and delete endpoints`
- `feat(ui): build my list screen with bookmark toggle`
- `test(bookmarks): cover service, endpoints, and component states`
- `docs: record bookmarks feature in DEVELOPMENT.md`

These are then squashed into a single commit on `main` at merge time.

