export interface ReleaseLogEntry {
  version: string;
  titleEn: string;
  titleZh: string;
  en: string;
  zh: string;
}

export interface ReleaseHighlight {
  en: string;
  zh: string;
}

export const RELEASE_LOG: ReleaseLogEntry[] = [
  {
    version: '1.0.0',
    titleEn: 'Recurring controls for Daily Notes',
    titleZh: 'Daily Note 循环任务控制',
    en: 'Adds a Daily Note option to include or hide incomplete recurring tasks due today, while keeping completed recurring occurrence recovery as a separate option.',
    zh: '新增 Daily Note 选项，可选择是否包含今天截止的未完成循环任务；已完成循环任务 occurrence 仍保持独立控制。',
  },
  {
    version: '0.9.0',
    titleEn: 'Past Daily Note cleanup',
    titleZh: '清理过去的 Daily Note',
    en: 'Adds a manual cleanup tool for past Daily Notes. Preview stale generated rows, remove unfinished tasks that moved to another date, mark historical rows completed, or remove completed historical rows without deleting Todoist tasks.',
    zh: '新增过去 Daily Note 的手动清理工具。你可以先预览过期生成行，再移除已移动到其他日期的未完成任务、标记已完成历史行，或移除已完成历史行；不会删除 Todoist 任务。',
  },
  {
    version: '0.8.0',
    titleEn: 'Daily Note completed-task modes',
    titleZh: 'Daily Note 已完成任务模式',
    en: 'Daily Note completed tasks now have three clear modes: hide completed tasks, keep completed tasks due today, or keep all tasks completed today. Existing users keep the previous behavior after upgrade.',
    zh: 'Daily Note 的已完成任务现在有三种明确模式：不显示已完成任务、保留截止日期是今天的已完成任务，或显示今天完成的所有任务。老用户升级后会保留原有行为。',
  },
  {
    version: '0.7.0',
    titleEn: 'Structured due, time, and recurring safety',
    titleZh: '结构化 due、时间和循环任务保护',
    en: 'Added structured due handling for all-day dates, floating local times, fixed times, and recurring occurrences, with safeguards that prevent recurring or timed Todoist tasks from being downgraded by Markdown edits.',
    zh: '新增全天日期、浮动本地时间、固定时间和循环任务 occurrence 的结构化 due 处理，并防止 Markdown 编辑把 Todoist 的循环或定时任务降级。',
  },
  {
    version: '0.6.2',
    titleEn: 'Completed recurring recovery',
    titleZh: '已完成循环任务补回',
    en: 'Daily Note can recover completed recurring occurrences through Todoist activity logs, while generated Daily Note rows remain completion-focused.',
    zh: 'Daily Note 可通过 Todoist 活动日志补回已完成的循环任务 occurrence，同时生成行仍然只专注同步完成状态。',
  },
  {
    version: '0.5.0',
    titleEn: 'Daily Note polish',
    titleZh: 'Daily Note 体验完善',
    en: 'Added English and Simplified Chinese settings, Daily Note sorting, completed-task inclusion, and marker overwrite warnings.',
    zh: '新增英文和简体中文设置界面、Daily Note 排序、已完成任务保留，以及 marker 覆盖提醒。',
  },
];

export const RECENT_UPDATE_HIGHLIGHTS: ReleaseHighlight[] = [
  {
    en: 'Daily Note recurring tasks now have separate controls for incomplete tasks and completed occurrences.',
    zh: 'Daily Note 循环任务现在可分别控制未完成任务和已完成 occurrence。',
  },
  {
    en: 'Past Daily Note cleanup can remove stale generated rows while leaving Todoist tasks untouched.',
    zh: '过去 Daily Note 清理工具可以移除过期生成行，同时不删除 Todoist 任务。',
  },
  {
    en: 'Daily Note can distinguish planning mode from completion-log mode.',
    zh: 'Daily Note 现在可以区分“今日计划”和“今日完成日志”两种使用方式。',
  },
  {
    en: 'Recurring and timed Todoist due rules are preserved instead of being silently downgraded.',
    zh: 'Todoist 的循环和定时 due 规则会被保留，不会被静默降级。',
  },
  {
    en: 'Generated Daily Note rows can complete Todoist tasks without pushing title, project, label, or unsafe due edits back to Todoist.',
    zh: 'Daily Note 生成行可以完成 Todoist 任务，但不会把标题、项目、标签或不安全 due 编辑反向推回 Todoist。',
  },
];

export function entryForVersion(version: string): ReleaseLogEntry | undefined {
  return RELEASE_LOG.find(entry => entry.version === version);
}

export function isVersionNewer(a: string, b: string): boolean {
  if (!a) return false;
  if (!b) return true;
  const pa = a.split('.').map(n => parseInt(n, 10));
  const pb = b.split('.').map(n => parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] || 0;
    const bv = pb[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}
