# Changelog

All notable Sync Todoist changes are tracked here.

## 0.8.0 - 2026-05-16

- Changed Daily Note completed-task handling from one toggle to a three-mode selector:
  `Do not show completed tasks`, `Only tasks due today`, and `All tasks completed today`.
- Preserved existing upgraded-user behavior by migrating the old `includeCompleted: true`
  setting to `All tasks completed today`.
- Kept completed recurring occurrence recovery as a separate option that appears whenever
  completed tasks are shown.
- Updated the settings tab style so the active tab is easier to see on mobile.
- Added a clickable version row at the top of General settings and a bilingual update-notes
  modal that appears automatically after an update.
- Added tests for completed-task filtering modes and legacy settings migration.

## 0.7.0 - 2026-05-15

- Added structured due handling for all-day dates, floating local times, fixed times, and
  recurring occurrences.
- Preserved Todoist fixed-time and recurring metadata with hidden `todoist-due` comments when
  Markdown cannot represent the full rule.
- Prevented fixed-time and recurring tasks from being downgraded into one-time date-only tasks.
- Improved Daily Note completed recurring recovery and current-sync recurring snapshots.
- Added version and build information in General settings.

## 0.6.2 - 2026-05-15

- Added completed recurring Daily Note recovery through Todoist activity logs.
- Prevented generated Daily Note rows and imported task rows from downgrading timed or
  recurring Todoist due rules.
- Removed Obsidian 1.8.7-only local storage usage and cleaned up community review issues.

## 0.5.2 - 2026-05-15

- Treated Todoist due datetimes that fall today as due today for Daily Note output.

## 0.5.1 - 2026-05-15

- Treated Daily Note completed-task inclusion as tasks completed today, regardless of due date.

## 0.5.0 - 2026-05-15

- Added English and Simplified Chinese settings UI.
- Added configurable Daily Note sorting and completed-task inclusion.
- Added a bilingual warning for managed Daily Note marker overwrites.

## 0.4.1 - 2026-05-15

- Enabled automatic sync notices by default on desktop and mobile with one shared setting.

## 0.4.0 - 2026-05-15

- Added prefixed Sync Todoist notices and notification controls for manual and automatic sync.

## 0.3.0 - 2026-05-15

- Added BRAT-ready Daily Note task insertion with configurable markers and project, label, and
  priority filters.

## 0.2.0 - 2026-05-15

- Shipped follow-up fixes from real Obsidian and Todoist use.

## 0.1.0 - 2026-05-15

- Started the independent Sync Todoist release line after importing upstream Syncist history.
- Added the Sync Todoist identity, `sync-todoist` plugin id, completed-task queries, subtasks,
  import, projects, labels, and Obsidian `requestUrl()` Todoist API access.
