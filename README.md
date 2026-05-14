# Sync Todoist

[![Version](https://img.shields.io/github/v/release/o1xhack/obsidian-sync-todoist?label=version&color=7c3aed)](https://github.com/o1xhack/obsidian-sync-todoist/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/o1xhack/obsidian-sync-todoist/total?label=downloads&color=7c3aed)](https://github.com/o1xhack/obsidian-sync-todoist/releases)
[![License](https://img.shields.io/github/license/o1xhack/obsidian-sync-todoist?color=7c3aed)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0%2B-7c3aed)](https://obsidian.md)
[![Plugin ID](https://img.shields.io/badge/plugin%20id-sync--todoist-7c3aed)](manifest.json)

**Sync Todoist keeps Obsidian Markdown tasks and Todoist tasks in sync, while preserving local notes, nested outlines, project metadata, labels, query blocks, and Daily Note planning.**

> Language: **English** · [简体中文](docs/i18n/README.zh-CN.md)

Sync Todoist is available through Obsidian Community Plugins. If you installed an earlier beta through BRAT, use the migration steps below to stop BRAT updates and continue with the community version.

## What's New in 0.6.2

- Cleans up Community Plugin review issues for Obsidian `minAppVersion`, bundled built-in modules, and typed settings persistence.
- Adds a Daily Note sub-option for completed recurring tasks.
- Keeps completed recurring occurrences in today's Daily Note when **Include completed tasks** is enabled.
- Uses Todoist activity logs to recover the completed occurrence because Todoist moves recurring tasks to their next due date after completion.
- Prevents Daily Note generated rows from downgrading Todoist timed or recurring due rules during bidirectional sync.
- Prevents ordinary imported recurring or timed tasks from having their Todoist due rules downgraded by Markdown date-only edits.
- Clarifies Daily Note flat rendering, completed-task behavior, and Query Block completed-task date windows in the documentation.

## Why Use It?

- **📝 Write tasks where you think** - add `#todoist` to an Obsidian checkbox and it becomes a Todoist task.
- **🔁 Sync both ways** - completion, title, due date, priority, labels, and project changes flow between Obsidian and Todoist.
- **🌳 Keep nested work intact** - indented Markdown child tasks become Todoist subtasks.
- **📥 Bring Todoist back into notes** - import existing Todoist tasks, including subtasks, at the cursor.
- **🔎 Render live Todoist views** - use `sync-todoist` query blocks for filtered task lists.
- **📅 Plan from Daily Notes** - write today's Todoist tasks into a managed Daily Note marker region.
- **📱 Work on desktop and mobile** - HTTP calls use Obsidian's `requestUrl()` API, not a Node-only SDK.

## Installation

### Community Plugins (recommended)

Install Sync Todoist from Obsidian's built-in Community Plugins browser.

1. Open **Settings -> Community plugins**.
2. If Restricted mode is on, click **Turn on community plugins**.
3. Click **Browse**.
4. Search for **Sync Todoist**.
5. Click **Install**, then **Enable**.
6. Open **Sync Todoist** settings and configure your Todoist API token.

### Migrating from BRAT

If you previously installed Sync Todoist through BRAT, migrate to the community version without deleting the plugin folder.

1. Open **Settings -> Community plugins -> Installed plugins**.
2. Disable **Sync Todoist**.
3. Open **Settings -> BRAT**.
4. Remove `o1xhack/obsidian-sync-todoist` from BRAT's beta plugin list. This stops BRAT from updating it; it does not need to uninstall the plugin from your vault.
5. Go back to **Settings -> Community plugins -> Browse**.
6. Search for **Sync Todoist**. Because the plugin ID is still `sync-todoist`, Obsidian may already show it as **Installed**.
7. If it is already installed, return to **Installed plugins** and enable **Sync Todoist**. If it is not installed, click **Install**, then **Enable**.
8. Confirm your Todoist API token is still present in settings, then run **Sync Todoist: Sync now** once.

Do not uninstall Sync Todoist from **Installed plugins** unless you intentionally want a clean reinstall.

<details>
<summary>Manual Release</summary>

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/o1xhack/obsidian-sync-todoist/releases/latest).
2. Create `.obsidian/plugins/sync-todoist/` in your vault.
3. Put the three files in that folder.
4. Restart Obsidian and enable **Sync Todoist**.

</details>

<details>
<summary>Build from Source</summary>

```bash
git clone https://github.com/o1xhack/obsidian-sync-todoist.git
cd obsidian-sync-todoist
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/sync-todoist/`.

</details>

## Quick Start

1. Get your Todoist API token from [Todoist Settings -> Integrations -> Developer](https://todoist.com/app/settings/integrations/developer).
2. Open **Settings -> Community plugins -> Sync Todoist**.
3. Paste the token and click **Verify**.
4. Add `#todoist` to a Markdown checkbox.
5. Run **Sync Todoist: Sync now**.

```markdown
- [ ] Buy groceries #todoist
```

After sync, Sync Todoist stores the Todoist task ID in an HTML comment:

```markdown
- [ ] Buy groceries #todoist <!-- todoist-id:8765432109 -->
```

## Sync Format

Sync Todoist reads and writes plain Markdown task lines. The `todoist-id` comment is the stable link between an Obsidian line and a Todoist task.

| Marker | Meaning | Todoist mapping |
|---|---|---|
| `#todoist` | Sync marker | Marks a top-level task for sync |
| `<!-- todoist-id:... -->` | Task identity | Keeps future syncs attached to the same Todoist task |
| `📅 2026-01-28` | Due date | Todoist due date |
| `due:2026-01-28` | Due date | Todoist due date |
| `🔺` | Urgent priority | Priority 4 |
| `⏫` | High priority | Priority 3 |
| `🔼` | Medium priority | Priority 2 |
| `🔽` | Normal priority | Priority 1 |
| `📁 Work` | Project | Todoist project named `Work` |
| `#label` | Label | Todoist label, except the sync tag |

## Subtasks

Indented Markdown tasks under a synced parent become Todoist subtasks. Child lines do not need `#todoist`; they inherit sync from the parent outline.

```markdown
- [ ] Plan launch #todoist 📁 Work #marketing 📅 2026-06-01
  - [ ] Draft announcement
  - [ ] Review screenshots
  - [ ] Publish release notes
```

How inheritance works:

- The parent task carries the sync tag.
- Child tasks are created with Todoist `parentId`.
- Child tasks inherit the Todoist project from the parent when they are created.
- Child task content, completion, due date, priority, and labels remain their own fields after sync.

## Projects and Labels

- Use `📁 ProjectName` to route a task to a Todoist project.
- If no project is written, new tasks use the configured default project or Inbox.
- Hashtags other than the sync tag become Todoist labels.
- Todoist project moves and label changes sync back to Obsidian when conflict handling allows Todoist to win.

## Query Blocks

Embed a live Todoist task list in any note:

````markdown
```sync-todoist
filter: today | overdue
```
````

Query blocks use [Todoist filter syntax](https://todoist.com/help/articles/introduction-to-filters-702348ff), render checkboxes, include a refresh button, and show the last updated time. The original `syncist` code block language is still accepted as a migration alias.

### Completed Tasks in Query Blocks

`include_completed` adds a second completed-task lookup and merges those results with the active tasks returned by `filter`. It does not automatically mean "completed today."

| Option | Description |
|---|---|
| `filter: today` | Active tasks matching a Todoist filter. |
| `include_completed: true` | Merge matching completed tasks into active results. |
| `completed_by: due_date` | Search completed tasks by Todoist due date. |
| `completed_by: completion_date` | Search completed tasks by completion time. |
| `completed_since: 30d` | Start of completed-task window: `30d`, `6w`, `3m`, `today`, `yesterday`, or `YYYY-MM-DD`. |
| `completed_until: today` | End of completed-task window: `today`, `now`, or `YYYY-MM-DD`. |
| `completed_range: today` | One bounded range: `today`, `yesterday`, `YYYY-MM-DD`, `30d`, `6w`, or `3m`. |

If `completed_by` is omitted, Sync Todoist infers a default:

- Date-oriented filters such as `today`, `overdue`, or `due before...` default to `due_date`.
- Label or project filters such as `@writing` or `#Work` default to `completion_date`.

Examples:

````markdown
```sync-todoist
filter: today
include_completed: true
completed_by: due_date
completed_range: today
```
````

Shows active tasks due today and completed tasks whose due date is today.

````markdown
```sync-todoist
filter: @writing
include_completed: true
completed_by: completion_date
completed_range: today
```
````

Shows active `@writing` tasks and `@writing` tasks completed today.

## Daily Notes

Sync Todoist can write today's matching Todoist tasks into today's Obsidian Daily Note. Enable Obsidian's core **Daily notes** plugin first, then open **Settings -> Sync Todoist -> Daily Note**.

Daily Note controls:

- Enable or disable Daily Note sync.
- Customize the source-mode start and end markers.
- Choose task filters by project, label, and priority.
- Choose primary sorting: time first or priority first.
- Include tasks completed today.
- Include completed recurring occurrences when completed tasks are enabled.
- Run a manual **Sync today** refresh.

Default marker block:

```markdown
%% sync-todoist:daily:start %%
- [ ] Review launch tasks #todoist 📁 Work 🔺 📅 2026-05-13 <!-- todoist-id:123456 -->
%% sync-todoist:daily:end %%
```

Important behavior:

- Sync Todoist fully rewrites everything between the markers during sync.
- Do not manually edit inside the marker region unless you are ready for those edits to be overwritten.
- Daily Note output is a **flat list**. It does not expand Todoist parent tasks into nested child outlines.
- If a Todoist subtask independently matches the Daily Note filters, it can appear as its own top-level row.
- Daily Note rows copy each task's own content, completion state, due date, priority, labels, and project display.
- Regular Markdown inheritance for subtasks is not applied inside the Daily Note generated block.

Completed and recurring behavior:

- Active tasks are included when their current Todoist due date falls today.
- Timed due dates and current recurring occurrences are treated as today when their local date is today.
- With **Include completed tasks**, regular tasks completed today remain checked in the Daily Note block.
- With **Include completed recurring tasks**, Sync Todoist also checks today's activity log and keeps recurring tasks completed today as checked rows.
- Todoist moves recurring tasks to the next occurrence after completion, so the activity-log fallback is required to preserve today's completed occurrence.

## Settings

| Setting | Default | Description |
|---|---|---|
| Interface language | English | Settings UI language. Supports English and Simplified Chinese. |
| Todoist API token | empty | Required token used to call Todoist's API. Stored locally in Obsidian plugin data. |
| Sync tag | `#todoist` | Markdown tag that marks top-level tasks for sync. |
| Default project | Inbox | Todoist project for new tasks unless the task has `📁 ProjectName`. |
| Sync interval | `5` minutes | Auto-sync frequency. Set to `0` to disable automatic sync. |
| Conflict resolution | `Todoist wins` | Behavior when both Obsidian and Todoist changed the same task. |
| Daily Note filters | All | Optional project, label, and priority filters for today's Daily Note block. |
| Daily Note primary sort | `Time first` | Sort Daily Note tasks by time then priority, or by priority then time. |
| Include completed tasks | Off | Keep Todoist tasks completed today in the Daily Note block. |
| Include completed recurring tasks | Off | Sub-option shown only when completed tasks are enabled. Uses activity log fallback. |
| Manual sync notices | On | Show short `Sync Todoist:` completion notices for manual sync actions. |
| Automatic sync notices | On | Show scheduled sync notices on desktop and mobile, including zero-change summaries. |

## Commands

| Command | What it does |
|---|---|
| **Create task from current line** | Converts the current Markdown task into a synced Todoist task. |
| **Import task from todoist** | Searches open Todoist tasks and inserts the selected task, including subtasks, at the cursor. |
| **Sync now** | Runs a manual sync. |
| **Sync today's daily note** | Refreshes today's managed Daily Note task block. |
| **Open settings** | Opens the Sync Todoist settings tab. |

## Development

```bash
npm install
npm run lint
npm run build
npx tsc --noEmit
npm test
```

Use [test/TEST_SPEC_v2.0.0.md](test/TEST_SPEC_v2.0.0.md) for manual QA against a test vault and Todoist account.

Release tags must exactly match `manifest.json` `version`, and every public release must attach `main.js`, `manifest.json`, and `styles.css`. See [RELEASE.md](RELEASE.md).

## FAQ

### Why is the repository named `obsidian-sync-todoist` but the plugin ID is `sync-todoist`?

The GitHub repository keeps the descriptive Obsidian-focused name. The Obsidian plugin ID is `sync-todoist` because Obsidian plugin IDs must not include `obsidian`.

### Where is my Todoist API token stored?

It is stored locally in Obsidian's plugin data file for your vault. The runtime `data.json` file is intentionally gitignored.

### Does this use a third-party Todoist SDK?

No. Sync Todoist talks directly to Todoist API v1 through Obsidian's `requestUrl()` API for desktop and mobile compatibility.

## Contributing

Issues and PRs are welcome. Before opening a PR, run:

```bash
npm run lint
npm run build
npx tsc --noEmit
npm test
```

For behavior changes, also walk through the relevant sections of [test/TEST_SPEC_v2.0.0.md](test/TEST_SPEC_v2.0.0.md).

## Acknowledgements

Sync Todoist is based on [Syncist](https://github.com/bastiaanschonhage/syncist) by Bastiaan Schönhage, used under the MIT License. This repository keeps the upstream history, copyright notice, and license text intact while adding the independent Sync Todoist release line, `sync-todoist` plugin ID, subtasks, import, projects, labels, query blocks, Daily Notes, and completed-task support.

## License

MIT - see [LICENSE](LICENSE).
