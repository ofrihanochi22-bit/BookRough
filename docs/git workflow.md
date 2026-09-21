### Git Workflow & Conventions Specification

### 1. Core Philosophy

The primary goal of this workflow is maintainability and traceability. Every commit should tell a clear story of what changed and why, and the main branch must always remain in a stable, deployable state.

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

### 4. The Pull Request (PR) Workflow

Even as a solo developer, enforcing a strict PR process is critical for self-review. It forces you to step back, look at the aggregate diff, and catch mistakes (like leaving console.log() statements) before they pollute the main branch.

### Step-by-Step PR Process

- **Commit Often:** While working on your feat/ branch, make small, atomic commits.
- **Push:** Push the feature branch to the remote repository.
git push -u origin feat/bookmark-songs
- **Open PR:** Open a Pull Request on GitHub/GitLab merging feat/bookmark-songs into main.
- **Self-Review:** Go through the "Files Changed" tab line-by-line. Act as your own code reviewer. Check for:
  - Clean, readable code.
  - No leftover debugging code (console.log, commented-out blocks).
  - Proper error handling.
- **Merge:** Once satisfied, merge the PR into main.
- **Clean Up:** Delete the feature branch locally and remotely after merging to keep the repository clean.

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

