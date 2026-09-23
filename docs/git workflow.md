### Git Workflow & Conventions Specification

### 1. Core Philosophy

The primary goal of this workflow is maintainability and traceability. Every commit should tell a clear story of what changed and why, and the main branch must always remain in a stable, deployable state.

### 1.1. Division of Responsibility

**Claude owns every git and GitHub operation in this project. The developer runs no git commands.**

| Responsibility | Owner |
|---|---|
| Creating and switching branches | Claude |
| Staging and committing | Claude |
| Writing commit messages | Claude |
| Pushing to the remote | Claude |
| Opening the Pull Request and writing its description | Claude |
| Reviewing the "Files Changed" diff | **Developer** |
| Clicking Merge | **Developer** |
| Deleting the merged branch | Claude |

This has two consequences worth stating plainly.

First, **Claude must never instruct the developer to run a git command** — it must run the command itself. Work left uncommitted at the end of a step is a failure on Claude's part, not a handoff.

Second, **Claude must never merge.** The developer's review of the aggregate diff is the single human gate in this process, and it is the one thing that catches what automated checks cannot: a design that is technically correct but wrong for the product. Claude does not merge, does not enable auto-merge, and never pushes directly to `main`.

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
- **Review (Developer):** Go through the "Files Changed" tab line-by-line. Check for:
  - Clean, readable code.
  - No leftover debugging code (console.log, commented-out blocks).
  - Proper error handling.
  - That the feature actually matches what was agreed in its specification.
- **Merge (Developer):** Once satisfied, **squash and merge** the PR into main. Squashing keeps one well-formed Conventional Commit per feature on main, so the history reads as a list of delivered capabilities rather than a transcript of the work.
- **Clean Up (Claude):** After the developer confirms the merge, delete the feature branch locally and remotely, and check out an updated main.

### PR Description Template

To maintain thorough project documentation, use this lightweight template in the body of your Pull Requests:
Markdown

## Objective

[Briefly describe what this PR accomplishes. E.g., "Implements UC-1: User Registration via Email and Google."]

## Changes Made

- Added `users` table migration.
- Created POST `/api/auth/register` endpoint.
- Built React Registration screen with form validation.

## Testing Performed

- [x] Tested successful email registration.
- [x] Tested duplicate email error handling.
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

