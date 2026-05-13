# Release and Tag Plan

Sync Todoist has an independent release line. Upstream Syncist tags and releases are intentionally not reused in this repository.

## Rules

- Use semver versions in `x.y.z` form.
- Git tags must exactly match `manifest.json` `version`.
- Do not prefix release tags with `v`.
- Keep `manifest.json` and `package.json` versions identical.
- Every public release must include `main.js`, `manifest.json`, and `styles.css` as GitHub release assets.
- Build before tagging so the committed `main.js` matches the source.

## Release Line

- `0.1.0`: first independent Sync Todoist baseline release after importing upstream Syncist history. This version includes the Sync Todoist rebrand, the `sync-todoist` Obsidian plugin id, the independent release/tag line, and the feature set added on top of upstream Syncist.
- `0.2.0`: follow-up test release for fixes found during real Obsidian/Todoist use.
- `0.3.0`: Daily Note release. Adds BRAT-ready Daily Note task insertion with configurable markers and project, label, and priority filters.
- `0.4.0`: notification release. Adds prefixed Sync Todoist notices, manual and automatic sync notification controls, and mobile automatic sync notices.
- `0.4.1`: notification default fix. Enables automatic sync notices by default on desktop and mobile with one shared setting.
- `0.5.0`: Daily Note polish release. Adds English/Simplified Chinese settings UI, configurable Daily Note primary sorting, completed-task inclusion for today's Daily Note, and a bilingual marker overwrite warning.
- `0.5.1`: Daily Note completed-task fix. Treats "Include completed tasks" as tasks completed today, regardless of due date.
- `0.5.2`: Daily Note due-date fix. Treats Todoist due datetimes that fall today as due today, so timed tasks and current recurring occurrences are not missed.
- `1.0.0`: first community-submission candidate after the test release line is stable.

## 0.1.0 Scope

`0.1.0` should be described as the first Sync Todoist release, not as a continuation of upstream Syncist releases.

Compared with the upstream Syncist baseline, `0.1.0` includes:

- Rebranded plugin identity: repository `obsidian-sync-todoist`, display name `Sync Todoist`, Obsidian plugin id `sync-todoist`.
- Independent release line: upstream Syncist tags and releases are intentionally not reused.
- Obsidian-compatible release packaging: release tags match `manifest.json` `version` exactly, with `main.js`, `manifest.json`, and `styles.css` attached as release assets.
- Primary query block language `sync-todoist`, while keeping `syncist` as a migration alias.
- Completed-task query support through `include_completed`, `completed_by`, `completed_since`, `completed_until`, and `completed_range`.
- Subtask sync for indented Markdown tasks under a synced parent.
- Todoist task import from Obsidian, including subtasks.
- Todoist project metadata through `📁 ProjectName`.
- Bidirectional Todoist label sync through Markdown hashtags.
- Direct Todoist API v1 access through Obsidian `requestUrl()` for desktop and mobile compatibility.

## Release Checklist

1. Confirm the working tree is clean except intended release edits.
2. Update `manifest.json` and `package.json` to the same version.
3. Run:
   ```bash
   npm run lint
   npm run build
   npx tsc --noEmit
   ```
4. Run the manual test spec in `test/TEST_SPEC_v2.0.0.md`.
5. Commit the version bump and rebuilt `main.js`.
6. Create a tag matching the version exactly:
   ```bash
   git tag 0.1.0
   git push origin main 0.1.0
   ```
7. Create a GitHub release for that tag with `main.js`, `manifest.json`, and `styles.css`.

## Notes

- The repository name remains `obsidian-sync-todoist`.
- The Obsidian plugin id is `sync-todoist`.
- The Obsidian plugin display name is `Sync Todoist`.
- Deferred Daily Note item: evaluate whether completed recurring task occurrences need an Activity Log fallback after `0.5.2`; do not add a separate recurring-task setting until the due-today datetime fix is verified in real use.
