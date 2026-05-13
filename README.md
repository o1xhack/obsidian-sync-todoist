# Sync Todoist

[![Version](https://img.shields.io/badge/version-0.4.1-7c3aed)](RELEASE.md)
[![License](https://img.shields.io/github/license/o1xhack/obsidian-sync-todoist?color=7c3aed)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0%2B-7c3aed)](https://obsidian.md)
[![Plugin ID](https://img.shields.io/badge/plugin%20id-sync--todoist-7c3aed)](manifest.json)

**Sync Todoist keeps Markdown tasks in Obsidian and Todoist tasks in sync both ways, without giving up local notes, nested task outlines, labels, projects, or live filtered task views.**

> Language: **English** · [简体中文](docs/i18n/README.zh-CN.md)

---

## Why?

- **Write tasks where you think** - add `#todoist` to an Obsidian checkbox and it becomes a Todoist task.
- **Keep hierarchy intact** - indented children under a synced parent become Todoist subtasks automatically.
- **Bring Todoist into notes** - import existing Todoist tasks and render live Todoist filters with `sync-todoist` query blocks.
- **Plan from your Daily Note** - write today's matching Todoist tasks into a managed Daily Note region for daily review.
- **Works on desktop and mobile** - network calls use Obsidian's `requestUrl()` API instead of a Node-only SDK.

## 0.1.0 Baseline

`0.1.0` is the first independent Sync Todoist release line after importing the upstream Syncist history. It is not a continuation of upstream release tags.

Compared with the upstream Syncist baseline, this version is packaged as **Sync Todoist** with the Obsidian plugin ID `sync-todoist`, an independent tag/release plan, and release assets that follow Obsidian's current requirements. It also documents the Sync Todoist feature set now present in this repo: subtasks, Todoist task import, project metadata, bidirectional labels, the primary `sync-todoist` query block language, the `syncist` migration alias, and completed-task query options such as `include_completed`.

## Sync from Markdown

Add the sync tag to any Markdown task:

```markdown
- [ ] Buy groceries #todoist
- [ ] Meeting with team #todoist 📅 2026-01-28 ⏫
```

After sync, Sync Todoist records the Todoist task ID in an HTML comment so future edits update the same task:

```markdown
- [ ] Buy groceries #todoist <!-- todoist-id:8765432109 -->
```

Changes flow both ways. Completion, title edits, due dates, priorities, labels, projects, and configured conflict behavior are all handled during sync.

## Subtasks, Projects, and Labels

Indent tasks beneath a `#todoist` parent. Child tasks inherit sync from the parent, so you do not need to tag each child:

```markdown
- [ ] Plan launch #todoist 📁 Work #marketing 📅 2026-03-05
  - [ ] Draft announcement
  - [ ] Review screenshots
  - [ ] Publish release notes
```

`📁 ProjectName` routes a task to a Todoist project, and hashtags other than the sync tag are synced as Todoist labels. Subtask hierarchy is preserved with Todoist `parentId` relationships.

## Query Blocks

Embed a live Todoist task list in any note:

````markdown
```sync-todoist
filter: today | overdue
```
````

Query blocks use [Todoist filter syntax](https://todoist.com/help/articles/introduction-to-filters-702348ff), render checkboxes in Obsidian, include a refresh button, and show when they were last updated. The original `syncist` code block language is still accepted as a migration alias.

Completed tasks can be merged into query results with bounded archive lookups:

````markdown
```sync-todoist
filter: @writing
include_completed: true
completed_by: completion_date
completed_since: 30d
```
````

## Daily Notes

Sync Todoist can write today's matching Todoist tasks into today's Obsidian Daily Note. Enable Obsidian's core **Daily notes** plugin first, then open **Settings -> Sync Todoist -> 每日 Daily Note**.

The plugin writes only inside a marker block, using source-mode markers by default:

```markdown
%% sync-todoist:daily:start %%
- [ ] Review launch tasks #todoist 📁 Work 🔺 📅 2026-05-13 <!-- todoist-id:123456 -->
%% sync-todoist:daily:end %%
```

You can customize the start/end markers and choose which tasks appear using project, label, and priority multi-select filters. Empty selections mean **all** for that dimension. The Daily Note block refreshes during normal sync, and you can also run **Sync Todoist: Sync today's daily note** manually.

## Quick Start

1. Install the plugin with BRAT.
2. Get your Todoist API token from [Todoist Settings -> Integrations -> Developer](https://todoist.com/app/settings/integrations/developer).
3. Open **Settings -> Community plugins -> Sync Todoist**, paste the token, and click **Verify**.
4. Add `#todoist` to a Markdown task, then run **Sync Todoist: Sync now**.

## Install

<details>
<summary><b>BRAT (recommended)</b></summary>

Use BRAT while Sync Todoist is pending review for the Obsidian Community Plugins directory.

1. Open **Settings -> Community plugins**.
2. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat).
3. Run **BRAT: Add a beta plugin for testing**.
4. Enter `https://github.com/o1xhack/obsidian-sync-todoist`.
5. Enable **Sync Todoist** and configure your Todoist API token.

</details>

<details>
<summary><b>Pending: Community Plugins</b></summary>

Sync Todoist is not yet listed in the Obsidian Community Plugins directory. After approval:

1. Open **Settings -> Community plugins**.
2. Click **Browse** and search for **Sync Todoist**.
3. Install and enable the plugin.
4. Configure your Todoist API token in plugin settings.

</details>

<details>
<summary><b>Manual Release</b></summary>

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/o1xhack/obsidian-sync-todoist/releases/latest).
2. Create `.obsidian/plugins/sync-todoist/` in your vault.
3. Copy the three release files into that folder.
4. Restart Obsidian and enable **Sync Todoist** in Community plugins.

</details>

<details>
<summary><b>Build from Source</b></summary>

```bash
git clone https://github.com/o1xhack/obsidian-sync-todoist.git
cd obsidian-sync-todoist
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/sync-todoist/` in a test vault.

</details>

## Configuration

| Setting | Default | Description |
|---|---|---|
| Todoist API token | empty | Required token used to call Todoist's API. Stored locally in Obsidian plugin data. |
| Sync tag | `#todoist` | Markdown tag that marks top-level tasks for sync. |
| Default project | Inbox | Todoist project for new tasks unless the task has `📁 ProjectName`. |
| Sync interval | `5` minutes | Auto-sync frequency. Set to `0` to disable automatic sync. |
| Conflict resolution | `Todoist wins` | Behavior when both Obsidian and Todoist changed the same task. |
| Daily Note filters | All | Optional project, label, and priority filters for today's Daily Note block. |
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

## Supported Task Metadata

| Marker | Meaning | Todoist mapping |
|---|---|---|
| `📅 2026-01-28` | Due date | Task due date |
| `due:2026-01-28` | Due date | Task due date |
| `🔺` | Urgent priority | Priority 4 |
| `⏫` | High priority | Priority 3 |
| `🔼` | Medium priority | Priority 2 |
| `🔽` | Normal priority | Priority 1 |
| `📁 Work` | Project | Todoist project named `Work` |
| `#label` | Label | Todoist label, except the sync tag |

## Query Block Reference

| Option | Description |
|---|---|
| `filter: today` | Active tasks matching a Todoist filter. |
| `include_completed: true` | Merge matching completed tasks into active results. |
| `completed_by: due_date` | Search completed tasks by their Todoist due date. |
| `completed_by: completion_date` | Search completed tasks by when they were completed. |
| `completed_since: 30d` | Start of completed-task window: `30d`, `6w`, `3m`, `today`, `yesterday`, or `YYYY-MM-DD`. |
| `completed_until: today` | End of completed-task window: `today`, `now`, or `YYYY-MM-DD`. |
| `completed_range: today` | Shortcut for one bounded range: `today`, `yesterday`, `YYYY-MM-DD`, `30d`, `6w`, or `3m`. |

Todoist completed-task archive endpoints require a bounded date window. If no window is configured, Sync Todoist uses the last 6 weeks for `completed_by: due_date` and the last 30 days for `completed_by: completion_date`.

## Development

```bash
npm install
npm run lint
npm run build
npx tsc --noEmit
```

No automated test framework is configured. Use [test/TEST_SPEC_v2.0.0.md](test/TEST_SPEC_v2.0.0.md) for manual QA against a test vault and Todoist account.

Release tags must exactly match `manifest.json` `version`, and every public release must attach `main.js`, `manifest.json`, and `styles.css`. See [RELEASE.md](RELEASE.md).

## FAQ

<details>
<summary><b>Why is the repository named <code>obsidian-sync-todoist</code> but the plugin ID is <code>sync-todoist</code>?</b></summary>

The GitHub repository keeps the descriptive Obsidian-focused name. The Obsidian plugin ID is `sync-todoist` because Obsidian plugin IDs must not include `obsidian`.

</details>

<details>
<summary><b>Where is my Todoist API token stored?</b></summary>

It is stored locally in Obsidian's plugin data file for your vault. The runtime `data.json` file is intentionally gitignored.

</details>

<details>
<summary><b>Does this use a third-party Todoist SDK?</b></summary>

No. Sync Todoist talks directly to Todoist API v1 through Obsidian's `requestUrl()` API for desktop and mobile compatibility.

</details>

## Contributing

Issues and PRs are welcome. Before opening a PR, run:

```bash
npm run lint
npm run build
npx tsc --noEmit
```

For behavior changes, also walk through the relevant sections of [test/TEST_SPEC_v2.0.0.md](test/TEST_SPEC_v2.0.0.md).

## Acknowledgements

Sync Todoist is based on [Syncist](https://github.com/bastiaanschonhage/syncist) by Bastiaan Schönhage, used under the MIT License. This repository keeps the upstream history, copyright notice, and license text intact while adding the independent Sync Todoist release line, `sync-todoist` plugin ID, subtasks, import, projects, labels, query blocks, and completed-task queries.

## License

MIT - see [LICENSE](LICENSE).

---

Author: [o1xhack](https://github.com/o1xhack)
