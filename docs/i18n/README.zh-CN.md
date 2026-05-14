# Sync Todoist

[![版本](https://img.shields.io/github/v/release/o1xhack/obsidian-sync-todoist?label=version&color=7c3aed)](https://github.com/o1xhack/obsidian-sync-todoist/releases/latest)
[![下载量](https://img.shields.io/github/downloads/o1xhack/obsidian-sync-todoist/total?label=downloads&color=7c3aed)](https://github.com/o1xhack/obsidian-sync-todoist/releases)
[![许可证](https://img.shields.io/github/license/o1xhack/obsidian-sync-todoist?color=7c3aed)](../../LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0%2B-7c3aed)](https://obsidian.md)
[![插件 ID](https://img.shields.io/badge/plugin%20id-sync--todoist-7c3aed)](../../manifest.json)

**Sync Todoist 在 Obsidian Markdown 任务和 Todoist 任务之间做双向同步，同时保留本地笔记、嵌套任务、项目、标签、查询块和 Daily Note 计划流。**

> 语言：[English](../../README.md) · **简体中文**

Sync Todoist 已可通过 Obsidian Community Plugins 安装。如果你之前通过 BRAT 安装了 beta 版本，可以按下面的迁移步骤停止 BRAT 更新，并继续使用社区插件版本。

## 0.7.0 新功能

- 增加结构化 due 处理，覆盖 Todoist 的全天日期、浮动本地时间、固定时间和循环任务当前 occurrence。
- 支持 Markdown 浮动时间语法：`📅 2026-06-01 15:00` 和 `due:2026-06-01 15:00`。
- 可编辑的浮动时间会通过 Todoist `due_datetime` 同步，不再丢失几点几分。
- 对 Markdown 无法完整表达的固定时间和循环规则，使用隐藏的 `todoist-due` 注释保留 Todoist 元数据。
- 防止固定时间和循环任务在双向同步时被降级成一次性的纯日期任务。
- 导入任务、查询块和 Daily Note 输出使用同一套结构化 due 显示。
- 修复 Daily Note 已完成循环任务补回逻辑：按 Todoist API 要求用 list 参数读取活动日志，并使用已完成 occurrence 日期，而不是任务推进后的下一次 due date。
- 当 Todoist Activity Log 延迟返回时，保留本轮同步刚完成的循环任务快照，避免 Daily Note 立刻重写时短暂消失。
- 保留 Obsidian wikilink heading，例如 `[[note#heading]]`，不会把 heading anchor 误当成 Todoist 标签。
- 在通用设置底部显示版本和构建信息，方便区分重复构建的 draft 包。
- 增加 due 解析、格式化、Todoist API payload、同步规则和 Daily Note 保护逻辑的增量测试。

## 为什么用它？

- **📝 在思考的位置写任务** - 给 Obsidian checkbox 加上 `#todoist`，它就会成为 Todoist 任务。
- **🔁 双向同步** - 完成状态、标题、截止日期、优先级、标签和项目会在 Obsidian 与 Todoist 之间同步。
- **🌳 保留嵌套任务** - 缩进的 Markdown 子任务会成为 Todoist 子任务。
- **📥 把 Todoist 带回笔记** - 可以在光标位置导入 Todoist 任务和子任务。
- **🔎 渲染实时 Todoist 视图** - 用 `sync-todoist` 查询块显示筛选后的任务列表。
- **📅 从 Daily Note 做计划** - 把今天的 Todoist 任务写入受控的 Daily Note marker 区间。
- **📱 桌面和移动端都可用** - 网络请求使用 Obsidian 的 `requestUrl()`，不是 Node-only SDK。

## 安装

### Community Plugins（推荐）

从 Obsidian 内置的 Community Plugins 浏览器安装 Sync Todoist。

1. 打开 **Settings -> Community plugins**。
2. 如果 Restricted mode 仍然开启，点击 **Turn on community plugins**。
3. 点击 **Browse**。
4. 搜索 **Sync Todoist**。
5. 点击 **Install**，然后点击 **Enable**。
6. 打开 **Sync Todoist** 设置，配置 Todoist API token。

### 从 BRAT 迁移

如果你之前通过 BRAT 安装了 Sync Todoist，请按下面步骤迁移到社区插件版本，不要删除插件文件夹。

1. 打开 **Settings -> Community plugins -> Installed plugins**。
2. 关闭 **Sync Todoist**。
3. 打开 **Settings -> BRAT**。
4. 从 BRAT 的 beta plugin 列表中移除 `o1xhack/obsidian-sync-todoist`。这一步只是停止 BRAT 继续更新它，不需要从 vault 中卸载插件本体。
5. 回到 **Settings -> Community plugins -> Browse**。
6. 搜索 **Sync Todoist**。由于插件 ID 仍然是 `sync-todoist`，Obsidian 可能会直接显示 **Installed**。
7. 如果已经显示 installed，回到 **Installed plugins** 并重新启用 **Sync Todoist**。如果没有安装，则点击 **Install**，然后点击 **Enable**。
8. 确认 Todoist API token 仍然在设置中，然后运行一次 **Sync Todoist: Sync now**。

除非你想完全重新安装，否则不要在 **Installed plugins** 里卸载 Sync Todoist。

<details>
<summary>Manual Release</summary>

1. 从 [latest release](https://github.com/o1xhack/obsidian-sync-todoist/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在 vault 中创建 `.obsidian/plugins/sync-todoist/`。
3. 把三个文件放进去。
4. 重启 Obsidian，在 Community plugins 中启用 **Sync Todoist**。

</details>

<details>
<summary>Build from Source</summary>

```bash
git clone https://github.com/o1xhack/obsidian-sync-todoist.git
cd obsidian-sync-todoist
npm install
npm run build
```

然后把 `main.js`、`manifest.json` 和 `styles.css` 复制到 `.obsidian/plugins/sync-todoist/`。

</details>

## 快速上手

1. 从 [Todoist Settings -> Integrations -> Developer](https://todoist.com/app/settings/integrations/developer) 获取 Todoist API token。
2. 打开 **Settings -> Community plugins -> Sync Todoist**。
3. 填入 token，然后点击 **Verify**。
4. 给 Markdown checkbox 加上 `#todoist`。
5. 运行 **Sync Todoist: Sync now**。

```markdown
- [ ] Buy groceries #todoist
```

同步后，Sync Todoist 会把 Todoist 任务 ID 写入 HTML 注释：

```markdown
- [ ] Buy groceries #todoist <!-- todoist-id:8765432109 -->
```

## 同步格式

Sync Todoist 读取和写入普通 Markdown task line。`todoist-id` 注释是 Obsidian 行和 Todoist task 之间的稳定连接。

| 标记 | 含义 | Todoist 映射 |
|---|---|---|
| `#todoist` | 同步标记 | 标记顶层任务需要同步 |
| `<!-- todoist-id:... -->` | 任务身份 | 后续同步继续关联同一个 Todoist 任务 |
| `📅 2026-01-28` | 截止日期 | Todoist due date |
| `📅 2026-01-28 15:00` | 浮动截止时间 | Todoist 本地墙钟时间 |
| `due:2026-01-28` | 截止日期 | Todoist due date |
| `due:2026-01-28 15:00` | 浮动截止时间 | Todoist 本地墙钟时间 |
| `<!-- todoist-due:{...} -->` | 受保护 due 元数据 | 保留固定时间和循环任务规则 |
| `🔺` | 紧急优先级 | Priority 4 |
| `⏫` | 高优先级 | Priority 3 |
| `🔼` | 中优先级 | Priority 2 |
| `🔽` | 普通优先级 | Priority 1 |
| `📁 Work` | 项目 | 名为 `Work` 的 Todoist 项目 |
| `#label` | 标签 | Todoist 标签，同步标签除外 |

### 截止日期和时间

Sync Todoist 支持 Todoist API v1 暴露的结构化 due 类型：

- **全天日期**：`📅 2026-06-01` 或 `due:2026-06-01`。
- **浮动本地时间**：`📅 2026-06-01 15:00` 或 `due:2026-06-01 15:00`。
- **固定时间**：显示为本地日期/时间，同时保留隐藏元数据，避免丢失 timezone 语义。
- **循环任务 occurrence**：显示当前 occurrence，同时保留隐藏元数据；勾选完成时让 Todoist 推进下一次循环，而不是替换循环规则。

Markdown 里的 due 编辑只支持结构化格式。本版本不会从 Markdown 解析 `every Friday at 15:00` 或 `tomorrow at 5pm` 这类自然语言循环规则；请在 Todoist 中编辑这些循环规则。

## 子任务

带同步标签的父任务下面，缩进的 Markdown 任务会成为 Todoist 子任务。子任务不需要自己写 `#todoist`，它会从父级 outline 继承同步关系。

```markdown
- [ ] Plan launch #todoist 📁 Work #marketing 📅 2026-06-01
  - [ ] Draft announcement
  - [ ] Review screenshots
  - [ ] Publish release notes
```

继承规则：

- 父任务携带同步标签。
- 子任务创建时会带 Todoist `parentId`。
- 子任务创建时会继承父任务所在 Todoist 项目。
- 子任务自己的内容、完成状态、截止日期、优先级和标签会作为自己的字段继续同步。

## 项目和标签

- 用 `📁 ProjectName` 把任务放进指定 Todoist 项目。
- 如果没有写项目，新任务会进入默认项目或 Inbox。
- 除同步标签外的 hashtags 会成为 Todoist 标签。
- Obsidian wikilink 和 embed 内部的 hashtag 会保留在标题中，例如 `[[Project#Heading]]` 或 `![[clip#frame]]`，不会被当成 Todoist 标签。
- Todoist 里的项目移动和标签变化，在冲突策略允许时会同步回 Obsidian。

## 查询块

在任意笔记里嵌入实时 Todoist 任务列表：

````markdown
```sync-todoist
filter: today | overdue
```
````

查询块使用 [Todoist filter syntax](https://todoist.com/help/articles/introduction-to-filters-702348ff)，会渲染 checkbox、刷新按钮和最近更新时间。原来的 `syncist` 代码块语言仍作为迁移别名保留。

### 查询块里的已完成任务

`include_completed` 会额外发起一次已完成任务查询，并把结果合并到 `filter` 返回的未完成任务中。它不自动等于“今天完成”。

| 选项 | 说明 |
|---|---|
| `filter: today` | 匹配 Todoist filter 的未完成任务。 |
| `include_completed: true` | 把匹配的已完成任务合并到未完成结果中。 |
| `completed_by: due_date` | 按 Todoist 截止日期搜索已完成任务。 |
| `completed_by: completion_date` | 按完成时间搜索已完成任务。 |
| `completed_since: 30d` | 已完成任务窗口开始：`30d`、`6w`、`3m`、`today`、`yesterday` 或 `YYYY-MM-DD`。 |
| `completed_until: today` | 已完成任务窗口结束：`today`、`now` 或 `YYYY-MM-DD`。 |
| `completed_range: today` | 单个有界范围：`today`、`yesterday`、`YYYY-MM-DD`、`30d`、`6w` 或 `3m`。 |

如果省略 `completed_by`，Sync Todoist 会自动推断：

- `today`、`overdue`、`due before...` 这类日期意图 filter 默认使用 `due_date`。
- `@writing` 或 `#Work` 这类标签/项目 filter 默认使用 `completion_date`。

示例：

````markdown
```sync-todoist
filter: today
include_completed: true
completed_by: due_date
completed_range: today
```
````

显示今天截止的未完成任务，并合并截止日期也是今天的已完成任务。

````markdown
```sync-todoist
filter: @writing
include_completed: true
completed_by: completion_date
completed_range: today
```
````

显示未完成的 `@writing` 任务，并合并今天完成的 `@writing` 任务。

## Daily Notes

Sync Todoist 可以把今天匹配的 Todoist 任务写入当天的 Obsidian Daily Note。请先启用 Obsidian 核心插件 **Daily notes**，然后打开 **Settings -> Sync Todoist -> Daily Note**。

Daily Note 可控制：

- 启用或关闭 Daily Note 同步。
- 自定义 source mode 可见的 start / end marker。
- 按项目、标签、优先级筛选任务。
- 选择首要排序：时间优先或重要程度优先。
- 同步今天完成的任务。
- 在同步已完成任务开启时，额外包含今天完成的循环任务。
- 手动运行 **Sync today** 刷新。

默认 marker 区间：

```markdown
%% sync-todoist:daily:start %%
- [ ] Review launch tasks #todoist 📁 Work 🔺 📅 2026-05-13 <!-- todoist-id:123456 -->
%% sync-todoist:daily:end %%
```

重要行为：

- Sync Todoist 在同步时会完整重写 marker 之间的所有内容。
- 不要在 marker 区间内手动编辑，除非你接受这些编辑可能被覆盖。
- Daily Note 输出是 **扁平列表**，不会把 Todoist 父任务展开成嵌套子任务结构。
- 如果某个 Todoist 子任务自己符合 Daily Note 筛选条件，它可能作为独立顶层行出现。
- Daily Note 每一行复制的是该任务自己的内容、完成状态、截止日期、优先级、标签和项目显示。
- 普通 Markdown 子任务继承逻辑不会应用到 Daily Note 生成区间中。

已完成和循环任务：

- 未完成任务在当前 Todoist 截止日期落在今天时进入 Daily Note。
- 带时间的 due date 和当前循环任务 occurrence，只要本地日期是今天，就会算作今天。
- 开启 **同步已完成任务** 后，今天完成的普通任务会以 checked 状态保留。
- 开启 **包含已完成的循环任务** 后，Sync Todoist 会额外查询活动日志，把今天完成的循环任务这一轮以 checked 状态保留。
- Todoist 在循环任务完成后会把任务移动到下一次出现，因此需要活动日志 fallback 才能保留今天完成的这一轮。
- Todoist Activity Log 可能不会立刻返回刚完成的循环任务。若 Sync Todoist 在本轮同步中完成了循环任务，会先保留本地 checked 快照，直到活动日志追上。
- Daily Note 生成行以完成状态同步为主。勾选生成行可以完成匹配的 Todoist 任务，但生成区内的标题、项目、标签、优先级和不安全 due 规则编辑不会反向推送到 Todoist。

## 设置

| 设置 | 默认值 | 说明 |
|---|---|---|
| 界面语言 | 英语 | 设置界面语言，支持英语和简体中文。 |
| Todoist API token | 空 | 调用 Todoist API 所需的 token，存储在本地 Obsidian 插件数据中。 |
| Sync tag | `#todoist` | 标记顶层同步任务的 Markdown 标签。 |
| Default project | Inbox | 新任务默认进入的 Todoist 项目，除非任务写了 `📁 ProjectName`。 |
| Sync interval | `5` 分钟 | 自动同步频率。设为 `0` 可关闭自动同步。 |
| Conflict resolution | `Todoist wins` | Obsidian 和 Todoist 同时改动同一任务时的处理策略。 |
| Daily Note filters | 全部 | 控制今天 Daily Note 区块的项目、标签和优先级筛选。 |
| Daily Note 首要排序 | `时间优先` | Daily Note 任务按时间再按优先级排序，或按优先级再按时间排序。 |
| 同步已完成任务 | 关 | 将今天完成的 Todoist 任务保留在 Daily Note 区块中。 |
| 包含已完成的循环任务 | 关 | 只在同步已完成任务开启时显示。通过活动日志补回今天完成的循环任务。 |
| Manual sync notices | 开 | 手动同步后显示简短的 `Sync Todoist:` 完成通知。 |
| Automatic sync notices | 开 | 桌面端和移动端的定时同步都会显示通知，包括 0 变化摘要。 |
| 构建信息 | 当前构建 | 在通用设置底部显示插件版本、构建号和构建时间。 |

## 命令

| 命令 | 作用 |
|---|---|
| **Create task from current line** | 把当前 Markdown 任务转换成已同步的 Todoist 任务。 |
| **Import task from todoist** | 搜索打开的 Todoist 任务，并把选中的任务和子任务插入光标位置。 |
| **Sync now** | 手动运行同步。 |
| **Sync today's daily note** | 刷新今天 Daily Note 中受控的任务区块。 |
| **Open settings** | 打开 Sync Todoist 设置页。 |

## 开发

```bash
npm install
npm run lint
npm run build
npx tsc --noEmit
npm test
```

请使用 [test/TEST_SPEC_v2.0.0.md](../../test/TEST_SPEC_v2.0.0.md) 在测试 vault 和 Todoist 账号中做手动 QA。

Release tag 必须和 `manifest.json` 的 `version` 完全一致，每个公开 release 都必须附带 `main.js`、`manifest.json` 和 `styles.css`。详见 [RELEASE.md](../../RELEASE.md)。

## 常见问题

### 为什么仓库叫 `obsidian-sync-todoist`，插件 ID 却是 `sync-todoist`？

GitHub 仓库保留描述性名称。Obsidian 插件 ID 使用 `sync-todoist`，因为 Obsidian 插件 ID 不能包含 `obsidian`。

### 我的 Todoist API token 存在哪里？

它存储在当前 vault 的 Obsidian 插件数据文件中。运行时的 `data.json` 会被 gitignore，避免提交 token。

### 这个插件使用第三方 Todoist SDK 吗？

不使用。Sync Todoist 通过 Obsidian 的 `requestUrl()` 直接调用 Todoist API v1，以兼容桌面端和移动端。

## 参与贡献

欢迎提交 issue 和 PR。提交 PR 前请运行：

```bash
npm run lint
npm run build
npx tsc --noEmit
npm test
```

涉及行为变更时，也请走一遍 [test/TEST_SPEC_v2.0.0.md](../../test/TEST_SPEC_v2.0.0.md) 中相关的手动测试。

## 致谢

Sync Todoist 基于 Bastiaan Schönhage 的 [Syncist](https://github.com/bastiaanschonhage/syncist)，按 MIT License 使用。本仓库保留上游历史、版权声明和 license 文本，同时加入独立的 Sync Todoist release 线、`sync-todoist` 插件 ID、子任务、导入、项目、标签、查询块、Daily Notes 和已完成任务支持。

## 许可证

MIT - 见 [LICENSE](../../LICENSE)。
