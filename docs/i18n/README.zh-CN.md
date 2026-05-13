# Sync Todoist

[![版本](https://img.shields.io/badge/version-0.4.0-7c3aed)](../../RELEASE.md)
[![许可证](https://img.shields.io/github/license/o1xhack/obsidian-sync-todoist?color=7c3aed)](../../LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0%2B-7c3aed)](https://obsidian.md)
[![插件 ID](https://img.shields.io/badge/plugin%20id-sync--todoist-7c3aed)](../../manifest.json)

**Sync Todoist 在 Obsidian Markdown 任务和 Todoist 任务之间做双向同步，同时保留本地笔记、嵌套任务、标签、项目和实时筛选视图。**

> 语言：[English](../../README.md) · **简体中文**

---

## 为什么用它？

- **在思考的位置写任务** - 给 Obsidian checkbox 加上 `#todoist`，它就会成为 Todoist 任务。
- **保留任务层级** - 同步父任务下面的缩进子项会自动成为 Todoist 子任务。
- **把 Todoist 带进笔记** - 可以导入已有 Todoist 任务，也可以用 `sync-todoist` 查询块渲染实时筛选列表。
- **在 Daily Note 里做每日计划** - 把今天匹配的 Todoist 任务写入 Daily Note 中受控的标记区间。
- **桌面和移动端都可用** - 网络请求使用 Obsidian 的 `requestUrl()`，不是 Node-only SDK。

## 0.1.0 基线版本

`0.1.0` 是导入 upstream Syncist 历史之后，Sync Todoist 的第一个独立 release 版本线。它不是继续沿用 upstream 的 release tags。

和 upstream Syncist 基线相比，这个版本已经作为 **Sync Todoist** 重新打包，Obsidian plugin ID 是 `sync-todoist`，并且有独立的 tag/release 计划；release assets 也按当前 Obsidian 要求准备。README 同时说明了这个仓库当前已有的 Sync Todoist 功能：子任务、Todoist 任务导入、项目元数据、双向标签同步、主查询块语言 `sync-todoist`、迁移别名 `syncist`，以及 `include_completed` 等已完成任务查询选项。

## 从 Markdown 同步

给任意 Markdown 任务加上同步标签：

```markdown
- [ ] Buy groceries #todoist
- [ ] Meeting with team #todoist 📅 2026-01-28 ⏫
```

同步后，Sync Todoist 会把 Todoist 任务 ID 写入 HTML 注释，之后的编辑会更新同一个任务：

```markdown
- [ ] Buy groceries #todoist <!-- todoist-id:8765432109 -->
```

完成状态、标题修改、截止日期、优先级、标签、项目和冲突处理都会在同步时双向处理。

## 子任务、项目和标签

把任务缩进到带 `#todoist` 的父任务下。子任务会从父任务继承同步关系，不需要每一行都写同步标签：

```markdown
- [ ] Plan launch #todoist 📁 Work #marketing 📅 2026-03-05
  - [ ] Draft announcement
  - [ ] Review screenshots
  - [ ] Publish release notes
```

`📁 ProjectName` 会把任务放进对应 Todoist 项目；除同步标签外的 hashtags 会作为 Todoist 标签同步。子任务层级通过 Todoist `parentId` 关系保留。

## 查询块

在任意笔记里嵌入实时 Todoist 任务列表：

````markdown
```sync-todoist
filter: today | overdue
```
````

查询块使用 [Todoist filter syntax](https://todoist.com/help/articles/introduction-to-filters-702348ff)，会在 Obsidian 中渲染 checkbox、刷新按钮和最近更新时间。原来的 `syncist` 代码块语言仍作为迁移别名保留。

也可以把已完成任务合并进查询结果：

````markdown
```sync-todoist
filter: @writing
include_completed: true
completed_by: completion_date
completed_since: 30d
```
````

## Daily Notes

Sync Todoist 可以把今天匹配的 Todoist 任务写入当天的 Obsidian Daily Note。请先启用 Obsidian 核心插件 **Daily notes**，然后打开 **Settings -> Sync Todoist -> 每日 Daily Note**。

插件只会写入 marker 区间，默认使用 source mode 可见的注释标记：

```markdown
%% sync-todoist:daily:start %%
- [ ] Review launch tasks #todoist 📁 Work 🔺 📅 2026-05-13 <!-- todoist-id:123456 -->
%% sync-todoist:daily:end %%
```

你可以自定义 start/end marker，并通过项目、标签、优先级三个多选维度决定哪些任务进入 Daily Note。某个维度为空表示该维度选择 **全部**。Daily Note 区块会在普通同步时刷新，也可以手动运行 **Sync Todoist: Sync today's daily note**。

## 快速上手

1. 使用 BRAT 安装插件。
2. 从 [Todoist Settings -> Integrations -> Developer](https://todoist.com/app/settings/integrations/developer) 获取 Todoist API token。
3. 打开 **Settings -> Community plugins -> Sync Todoist**，填入 token，然后点击 **Verify**。
4. 给 Markdown 任务加上 `#todoist`，运行 **Sync Todoist: Sync now**。

## 安装

<details>
<summary><b>BRAT（推荐）</b></summary>

Sync Todoist 还在等待 Obsidian Community Plugins 审核，当前推荐先用 BRAT 安装。

1. 打开 **Settings -> Community plugins**。
2. 安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
3. 运行 **BRAT: Add a beta plugin for testing**。
4. 输入 `https://github.com/o1xhack/obsidian-sync-todoist`。
5. 启用 **Sync Todoist**，并配置 Todoist API token。

</details>

<details>
<summary><b>Pending: Community Plugins</b></summary>

Sync Todoist 目前还没有上架 Obsidian Community Plugins。审核通过后：

1. 打开 **Settings -> Community plugins**。
2. 点击 **Browse**，搜索 **Sync Todoist**。
3. 安装并启用插件。
4. 在插件设置里配置 Todoist API token。

</details>

<details>
<summary><b>Manual Release</b></summary>

1. 从 [latest release](https://github.com/o1xhack/obsidian-sync-todoist/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在 vault 中创建 `.obsidian/plugins/sync-todoist/`。
3. 把三个 release 文件复制进去。
4. 重启 Obsidian，在 Community plugins 中启用 **Sync Todoist**。

</details>

<details>
<summary><b>Build from Source</b></summary>

```bash
git clone https://github.com/o1xhack/obsidian-sync-todoist.git
cd obsidian-sync-todoist
npm install
npm run build
```

然后把 `main.js`、`manifest.json` 和 `styles.css` 复制到测试 vault 的 `.obsidian/plugins/sync-todoist/`。

</details>

## 配置

| 设置 | 默认值 | 说明 |
|---|---|---|
| Todoist API token | 空 | 调用 Todoist API 所需的 token，存储在本地 Obsidian 插件数据中。 |
| Sync tag | `#todoist` | 标记顶层同步任务的 Markdown 标签。 |
| Default project | Inbox | 新任务默认进入的 Todoist 项目，除非任务写了 `📁 ProjectName`。 |
| Sync interval | `5` 分钟 | 自动同步频率。设为 `0` 可关闭自动同步。 |
| Conflict resolution | `Todoist wins` | Obsidian 和 Todoist 同时改动同一任务时的处理策略。 |
| Daily Note filters | 全部 | 控制今天 Daily Note 区块的项目、标签和优先级筛选。 |
| Manual sync notices | 开 | 手动同步后显示简短的 `Sync Todoist:` 完成通知。 |
| Automatic sync notices | 关 | 开启后，桌面端定时同步会显示通知，包括 0 变化的摘要。 |
| Mobile automatic sync notices | 关 | 开启后，移动端定时同步会通过自动消失的 Obsidian notice 显示通知。 |

## 命令

| 命令 | 作用 |
|---|---|
| **Create task from current line** | 把当前 Markdown 任务转换成已同步的 Todoist 任务。 |
| **Import task from todoist** | 搜索打开的 Todoist 任务，并把选中的任务和子任务插入光标位置。 |
| **Sync now** | 手动运行同步。 |
| **Sync today's daily note** | 刷新今天 Daily Note 中受控的任务区块。 |
| **Open settings** | 打开 Sync Todoist 设置页。 |

## 支持的任务元数据

| 标记 | 含义 | Todoist 映射 |
|---|---|---|
| `📅 2026-01-28` | 截止日期 | Task due date |
| `due:2026-01-28` | 截止日期 | Task due date |
| `🔺` | Urgent priority | Priority 4 |
| `⏫` | High priority | Priority 3 |
| `🔼` | Medium priority | Priority 2 |
| `🔽` | Normal priority | Priority 1 |
| `📁 Work` | 项目 | 名为 `Work` 的 Todoist 项目 |
| `#label` | 标签 | Todoist 标签，同步标签除外 |

## 查询块参考

| 选项 | 说明 |
|---|---|
| `filter: today` | 匹配 Todoist filter 的未完成任务。 |
| `include_completed: true` | 把匹配的已完成任务合并到未完成结果中。 |
| `completed_by: due_date` | 按 Todoist 截止日期搜索已完成任务。 |
| `completed_by: completion_date` | 按完成时间搜索已完成任务。 |
| `completed_since: 30d` | 已完成任务窗口开始：`30d`、`6w`、`3m`、`today`、`yesterday` 或 `YYYY-MM-DD`。 |
| `completed_until: today` | 已完成任务窗口结束：`today`、`now` 或 `YYYY-MM-DD`。 |
| `completed_range: today` | 单个有界范围快捷写法：`today`、`yesterday`、`YYYY-MM-DD`、`30d`、`6w` 或 `3m`。 |

Todoist 已完成任务归档接口要求有边界的日期窗口。如果没有配置窗口，Sync Todoist 会对 `completed_by: due_date` 使用最近 6 周，对 `completed_by: completion_date` 使用最近 30 天。

## 开发

```bash
npm install
npm run lint
npm run build
npx tsc --noEmit
```

当前没有配置自动化测试框架。请使用 [test/TEST_SPEC_v2.0.0.md](../../test/TEST_SPEC_v2.0.0.md) 在测试 vault 和 Todoist 账号中做手动 QA。

Release tag 必须和 `manifest.json` 的 `version` 完全一致，每个公开 release 都必须附带 `main.js`、`manifest.json` 和 `styles.css`。详见 [RELEASE.md](../../RELEASE.md)。

## 常见问题

<details>
<summary><b>为什么仓库叫 <code>obsidian-sync-todoist</code>，插件 ID 却是 <code>sync-todoist</code>？</b></summary>

GitHub 仓库保留描述性名称。Obsidian 插件 ID 使用 `sync-todoist`，因为 Obsidian 插件 ID 不能包含 `obsidian`。

</details>

<details>
<summary><b>我的 Todoist API token 存在哪里？</b></summary>

它存储在当前 vault 的 Obsidian 插件数据文件中。运行时的 `data.json` 会被 gitignore，避免提交 token。

</details>

<details>
<summary><b>这个插件使用第三方 Todoist SDK 吗？</b></summary>

不使用。Sync Todoist 通过 Obsidian 的 `requestUrl()` 直接调用 Todoist API v1，以兼容桌面端和移动端。

</details>

## 参与贡献

欢迎提交 issue 和 PR。提交 PR 前请运行：

```bash
npm run lint
npm run build
npx tsc --noEmit
```

涉及行为变更时，也请走一遍 [test/TEST_SPEC_v2.0.0.md](../../test/TEST_SPEC_v2.0.0.md) 中相关的手动测试。

## 致谢

Sync Todoist 基于 Bastiaan Schönhage 的 [Syncist](https://github.com/bastiaanschonhage/syncist)，按 MIT License 使用。本仓库保留上游历史、版权声明和 license 文本，同时加入独立的 Sync Todoist release 线、`sync-todoist` 插件 ID、子任务、导入、项目、标签、查询块和已完成任务查询。

## 许可证

MIT - 见 [LICENSE](../../LICENSE)。

---

作者：[o1xhack](https://github.com/o1xhack)
