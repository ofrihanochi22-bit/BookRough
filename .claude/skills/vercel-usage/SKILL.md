---
name: vercel-usage
description: Read the BookRough Vercel team's usage meters (Functions Storage, Images Storage, Deployment Storage, transfer, compute) from the Usage page in the developer's Chrome, compare them with the Hobby limits and the previous reading, and say whether it is safe to deploy. Use when the developer runs /vercel-usage or asks about Vercel usage, storage or the risk of a pause, and always before merging a PR into main (CLAUDE.md §16).
---

# /vercel-usage — Vercel usage check

Going over a Hobby limit pauses the whole `bookrough` team (Images Storage did, for 30 days, on 2026-10-12). This skill reads every meter on the Usage page, flags the ones close to their limit, and keeps a local history so a meter that grows with each merge is caught early.

## Why the browser

Vercel's connector cannot read these meters on Hobby: `list_billing_charges` answers `404 costs_not_found`, and no other tool returns usage. The Usage page in the developer's Chrome, where they are signed in to Vercel, has every meter with its limit. So the skill uses **Claude in Chrome** (`mcp__claude-in-chrome__*`), read-only: it opens a tab, reads, closes the tab. It never clicks anything that changes the account.

## Steps

1. **Load the tools in one call:** `ToolSearch` `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__tabs_close_mcp`.
2. **Open a fresh tab:** `tabs_context_mcp` with `createIfEmpty: true`, then `tabs_create_mcp` unless the group has only an empty new tab. Never reuse one of the developer's own tabs.
3. **Navigate** that tab to `https://vercel.com/bookrough/~/usage`. If it lands on a login page, stop: ask the developer to sign in to Vercel in Chrome, and go no further.
4. **Collect.** Read [collect-usage.js](collect-usage.js) and run its full contents with `javascript_tool` on that tab. The page loads sections lazily, so the script reads it in passes until a whole pass finds nothing new: expect 4 to 8 runs. Batch them with `browser_batch` (navigate, then four identical `javascript_tool` runs, then four more if needed) to save round trips; a run after `done: true` changes nothing. Each run resumes where the last one stopped, in the same tab, and returns JSON:
   - `done`: true once the whole page has been read. Do not assess until it is true. If it is still false after 10 runs, report that and fall back (below).
   - `count`: meters read so far (about 55 in November 2026). If it stays 0, the page layout has changed: report that and fall back.
   - `period`: the 30-day window shown on the page.
   - `storage`: the three storage meters, each `{ value, pct }`.
   - `missingStorage`: storage meters the page never showed. If not empty, run the whole check once more in a new tab; if still missing, fall back for those meters. Never report a missing meter as OK.
   - `flagged`: every other meter at 60% or more.
   - `highestOther`: the fullest non-storage meter.
   - `unparsed`: meters whose units the script did not understand. Mention them, and assess them by eye.
5. **Close the tab** with `tabs_close_mcp`.
6. **Assess** (next section) and **append** to the history file.
7. **Report** to the developer (format below).

If Claude in Chrome is not connected, or any step fails twice, say so in one line and fall back to the old routine: ask the developer to read Functions Storage, Images Storage and Deployment Storage in Vercel → Usage. Before a merge, do not merge until one of the two has happened.

## Assessing the meters

The script computes each meter's percentage of its Hobby limit and skips meters with no limit (`-`). Status:

| Status   | Rule                                   |
| -------- | -------------------------------------- |
| OK       | under 60%                              |
| Watch    | 60% to under 80%                       |
| **Stop** | 80% or more, or a meter over its limit |

**The three storage meters always appear in the report, even at 0%**: `Deployment Storage / Functions Storage`, `Images / Storage`, `Deployment Storage / Deployment Storage`. They hold their value for as long as old deployments and images exist, so they grow with every merge to `main` (about 0.4 GB of image per deploy — docs/features/deployment-storage.md). Every other meter appears only when it is Watch or Stop. They count usage over the rolling 30-day window shown in `period`.

For each storage meter, compare with the previous history row and give the change. If the history has at least two earlier rows, estimate how many more merges like the last ones fit before 80% — only when the meter grew; say it is a rough estimate.

## History file

Append one row per run to `.claude/vercel-usage-history.md` (gitignored: it is a local log, so a reading never leaves an uncommitted change). Create it with this header when missing:

```markdown
# Vercel usage readings (written by /vercel-usage)

| Read at (UTC) | Main HEAD | Functions Storage | Images Storage | Deployment Storage | Highest other meter | Verdict |
| ------------- | --------- | ----------------- | -------------- | ------------------ | ------------------- | ------- |
```

`Main HEAD` is the short SHA of `origin/main` (`git rev-parse --short origin/main` after `git fetch`), so a jump can be tied to a merge. "Highest other meter" is the name and percentage of the fullest non-storage meter.

## Report

Keep it short and in the developer's language (Hebrew in an RTL view, CLAUDE.md §19):

- One verdict line: **Safe to deploy**, **Safe, but watch X**, or **Stop: X is at N%**.
- A small table: the three storage meters (value, limit, %, change since last reading), then any Watch or Stop meter.
- When a storage meter is Watch or Stop, the remedy: delete old backend images in the project's Images tab (keep the current production image) and old deployments, and check whether the `prune-images` job ran on the last push to `main` (docs/features/production-hardening.md §3.8). Deleting frees the meter gradually, within about a day.

## Before a merge into main

CLAUDE.md §16 requires a storage check before every merge. Run this skill instead of asking the developer to read the meters. **Do not merge on Stop.** Say which meter and wait for the developer's decision. On Watch, merge if told to, and mention it in the report.
