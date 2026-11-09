import type TodoistSyncPlugin from './main';
import { TodoistPriority, TodoistTask } from './types';
import type { CompletedTaskQueryOptions, TodoistCompletedTaskDateMode } from './todoist-service';
import { showSyncTodoistNotice } from './notices';
import { formatDueForMarkdown, normalizeTodoistDue } from './due';

export interface QueryConfig {
  filter: string;
  /** True when the completed-task lookup runs, including when implied by completedOnly. */
  includeCompleted: boolean;
  /** Hide active tasks and show only completed-task lookup results. */
  completedOnly: boolean;
  completedBy: TodoistCompletedTaskDateMode | null;
  completedSince: string | null;
  completedUntil: string | null;
  completedRange: string | null;
}

export interface ParseResult {
  config: QueryConfig | null;
  error: string | null;
}

export interface CompletedTaskWindow {
  by: TodoistCompletedTaskDateMode;
  since: Date;
  until: Date;
}

/** The subset of TodoistService that query blocks read from. */
export interface QueryTaskSource {
  getFilteredTasks(filter: string): Promise<TodoistTask[]>;
  getCompletedTasks(options: CompletedTaskQueryOptions): Promise<TodoistTask[]>;
}

export interface QueryTaskResult {
  tasks: TodoistTask[];
  completedWindow: CompletedTaskWindow | null;
  completedWarning: string | null;
}

export interface TaskTreeNode {
  task: TodoistTask;
  children: TaskTreeNode[];
}

/**
 * Thrown when a completed_only block cannot load its completed tasks. In that mode the
 * completed lookup is the whole result, so the failure is an error instead of a warning.
 */
export class CompletedTaskLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompletedTaskLookupError';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COMPLETED_WINDOW_DAYS: Record<TodoistCompletedTaskDateMode, number> = {
  due_date: 42,
  completion_date: 93,
};
const MAX_SUBTASK_DEPTH_CLASS = 4;
const TRUE_VALUES = ['true', 'yes', '1', 'on'];
const FALSE_VALUES = ['false', 'no', '0', 'off'];

export function parseQueryConfig(source: string): ParseResult {
  const lines = source.trim().split('\n');
  let filter = '';
  let includeCompleted = false;
  let completedOnly = false;
  let completedBy: TodoistCompletedTaskDateMode | null = null;
  let completedSince: string | null = null;
  let completedUntil: string | null = null;
  let completedRange: string | null = null;

  for (const line of lines) {
    const match = line.match(/^\s*([a-z_]+)\s*:\s*(.+)$/i);
    if (!match) {
      // Other options without a value are ignored, as before. An empty completed_only must
      // not silently fall back to showing active tasks.
      if (/^\s*completed_only\s*:\s*$/i.test(line)) {
        return { config: null, error: 'Invalid completed_only. Use true or false.' };
      }
      continue;
    }

    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === 'filter') {
      filter = value;
    } else if (key === 'include_completed') {
      includeCompleted = TRUE_VALUES.includes(value.toLowerCase());
    } else if (key === 'completed_only') {
      // Strict on purpose: a typo must not silently fall back to showing active tasks.
      const normalized = value.toLowerCase();
      if (TRUE_VALUES.includes(normalized)) {
        completedOnly = true;
      } else if (FALSE_VALUES.includes(normalized)) {
        completedOnly = false;
      } else {
        return { config: null, error: 'Invalid completed_only. Use true or false.' };
      }
    } else if (key === 'completed_by') {
      if (value !== 'due_date' && value !== 'completion_date') {
        return { config: null, error: 'Invalid completed_by. Use due_date or completion_date.' };
      }
      completedBy = value;
    } else if (key === 'completed_since') {
      completedSince = value;
    } else if (key === 'completed_until') {
      completedUntil = value;
    } else if (key === 'completed_range') {
      completedRange = value;
    }
  }

  if (!filter) {
    return { config: null, error: 'Invalid Sync Todoist block. Use: filter: today' };
  }

  return {
    config: {
      filter,
      // completed_only needs the completed lookup, so it implies include_completed.
      includeCompleted: includeCompleted || completedOnly,
      completedOnly,
      completedBy,
      completedSince,
      completedUntil,
      completedRange,
    },
    error: null,
  };
}

/**
 * Nest tasks under parents that are also in the result. A task whose parent is not in the
 * result (for example a completed subtask of an active parent in a completed_only block)
 * becomes a root. Descendants of any depth are kept.
 */
export function buildTaskTree(tasks: TodoistTask[]): TaskTreeNode[] {
  const taskMap = new Map<string, TodoistTask>();
  const childrenMap = new Map<string, TodoistTask[]>();

  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  for (const t of tasks) {
    if (t.parentId && t.parentId !== t.id && taskMap.has(t.parentId)) {
      const existing = childrenMap.get(t.parentId) ?? [];
      existing.push(t);
      childrenMap.set(t.parentId, existing);
    }
  }

  const buildNode = (task: TodoistTask, ancestors: Set<string>): TaskTreeNode => ({
    task,
    children: (childrenMap.get(task.id) ?? [])
      .filter(child => !ancestors.has(child.id))
      .map(child => buildNode(child, new Set([...ancestors, child.id]))),
  });

  const roots: TaskTreeNode[] = [];
  for (const t of tasks) {
    if (!t.parentId || t.parentId === t.id || !taskMap.has(t.parentId)) {
      roots.push(buildNode(t, new Set([t.id])));
    }
  }

  return roots;
}

const PRIORITY_EMOJI: Record<number, string> = {
  [TodoistPriority.HIGH]: '🔺',
  [TodoistPriority.MEDIUM]: '⏫',
  [TodoistPriority.LOW]: '🔼',
};

export function mergeTasks(activeTasks: TodoistTask[], completedTasks: TodoistTask[]): TodoistTask[] {
  const tasksById = new Map<string, TodoistTask>();
  for (const task of [...activeTasks, ...completedTasks]) {
    tasksById.set(task.id, task);
  }
  return Array.from(tasksById.values());
}

function inferCompletedBy(filter: string): TodoistCompletedTaskDateMode {
  const lower = filter.toLowerCase();
  const hasDateIntent = /\b(today|tomorrow|overdue|date|due|before|after|next|this week|last week)\b/.test(lower);
  const hasProjectOrLabelIntent = /(^|\s)[@#][^\s)]+/.test(filter);
  return hasProjectOrLabelIntent && !hasDateIntent ? 'completion_date' : 'due_date';
}

/**
 * A completed-window boundary: the start of a local calendar day, or an exact instant for
 * `now`. Day arithmetic is done on the calendar date, never on a Date's clock time, so a day
 * whose midnight is skipped by a DST change cannot shift other days to 01:00.
 */
type WindowBoundary =
  | { kind: 'day'; year: number; month: number; day: number }
  | { kind: 'instant'; date: Date };

function calendarDay(year: number, month: number, day: number, offset = 0): WindowBoundary {
  const date = new Date(Date.UTC(year, month, day + offset));
  return { kind: 'day', year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function localDay(date: Date, offset = 0): WindowBoundary {
  return calendarDay(date.getFullYear(), date.getMonth(), date.getDate(), offset);
}

/** Move by whole calendar days; an instant keeps its local clock time. */
function shiftBoundary(boundary: WindowBoundary, days: number): WindowBoundary {
  if (boundary.kind === 'day') return calendarDay(boundary.year, boundary.month, boundary.day, days);
  const date = boundary.date;
  return {
    kind: 'instant',
    date: new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + days,
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    ),
  };
}

/**
 * The instant sent to Todoist. A day starts at local midnight, or at the first local time
 * that exists when a DST change skips midnight.
 */
function boundaryInstant(boundary: WindowBoundary): Date {
  return boundary.kind === 'day' ? new Date(boundary.year, boundary.month, boundary.day) : boundary.date;
}

/** Local clock reading on a uniform scale, with a day boundary read as 00:00. */
function wallClock(boundary: WindowBoundary): number {
  if (boundary.kind === 'day') return Date.UTC(boundary.year, boundary.month, boundary.day);
  const date = boundary.date;
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
}

function parseDurationDays(value: string): number | null {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*([dwm])$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'd') return amount;
  if (unit === 'w') return amount * 7;
  return amount * 30;
}

function parseDateBoundary(value: string, now: Date, boundary: 'start' | 'end'): WindowBoundary | null {
  const lower = value.trim().toLowerCase();
  let day: WindowBoundary | null = null;

  if (lower === 'now') {
    return { kind: 'instant', date: new Date(now) };
  }

  if (lower === 'today') {
    day = localDay(now);
  } else if (lower === 'yesterday') {
    day = localDay(now, -1);
  } else if (lower === 'tomorrow') {
    day = localDay(now, 1);
  } else {
    const match = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      day = calendarDay(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }

  if (!day) return null;
  // `end` is exclusive: the start of the next day, so a whole calendar day is covered even
  // when that day is 23 or 25 hours long.
  return boundary === 'start' ? day : shiftBoundary(day, 1);
}

function resolveCompletedRange(value: string, now: Date): { since: WindowBoundary; until: WindowBoundary } | null {
  const lower = value.trim().toLowerCase();
  const durationDays = parseDurationDays(lower);
  const until = localDay(now, 1);

  if (durationDays !== null) {
    return { since: shiftBoundary(until, -durationDays), until };
  }

  const since = parseDateBoundary(lower, now, 'start');
  const rangeUntil = parseDateBoundary(lower, now, 'end');
  if (!since || !rangeUntil) return null;

  return { since, until: rangeUntil };
}

export function resolveCompletedWindow(config: QueryConfig, now: Date): CompletedTaskWindow {
  const by = config.completedBy ?? inferCompletedBy(config.filter);
  const defaultDays = by === 'due_date' ? 42 : 30;
  let since: WindowBoundary;
  let until: WindowBoundary;

  if (config.completedRange) {
    const range = resolveCompletedRange(config.completedRange, now);
    if (!range) {
      throw new Error('Invalid completed_range. Use today, yesterday, YYYY-MM-DD, or a duration like 30d/6w.');
    }
    since = range.since;
    until = range.until;
  } else {
    until = config.completedUntil
      ? parseDateBoundary(config.completedUntil, now, 'end') ?? (() => {
        throw new Error('Invalid completed_until. Use today, now, or YYYY-MM-DD.');
      })()
      : localDay(now, 1);

    if (config.completedSince) {
      const durationDays = parseDurationDays(config.completedSince);
      since = durationDays !== null
        ? shiftBoundary(until, -durationDays)
        : parseDateBoundary(config.completedSince, now, 'start') ?? (() => {
          throw new Error('Invalid completed_since. Use YYYY-MM-DD, today, yesterday, or a duration like 30d/6w.');
        })();
    } else {
      since = shiftBoundary(until, -defaultDays);
    }
  }

  const sinceInstant = boundaryInstant(since);
  const untilInstant = boundaryInstant(until);
  if (sinceInstant >= untilInstant) {
    throw new Error('Completed task range must start before it ends.');
  }

  // The limits are calendar days, so the hour a DST change adds or removes does not count.
  const maxDays = MAX_COMPLETED_WINDOW_DAYS[by];
  if (Math.ceil((wallClock(until) - wallClock(since)) / DAY_MS) > maxDays) {
    const maxLabel = by === 'due_date' ? '6w' : '3m';
    throw new Error(`Completed ${by} queries can cover at most ${maxLabel}.`);
  }

  return { by, since: sinceInstant, until: untilInstant };
}

export interface CompletedWindowRequest {
  since: Date;
  until: Date;
}

/**
 * Split a completed window into API requests that each span at most maxDays × 24h. Only a
 * window that a DST change makes longer than that is split, at a local midnight, so the
 * whole requested range is still fetched.
 */
export function completedWindowRequests(window: CompletedTaskWindow): CompletedWindowRequest[] {
  const maxDays = MAX_COMPLETED_WINDOW_DAYS[window.by];
  if (window.until.getTime() - window.since.getTime() <= maxDays * DAY_MS) {
    return [{ since: window.since, until: window.until }];
  }

  const requests: CompletedWindowRequest[] = [];
  let cursor = window.since;
  while (cursor < window.until) {
    const next = boundaryInstant(localDay(cursor, maxDays - 1));
    const segmentUntil = next < window.until ? next : window.until;
    requests.push({ since: cursor, until: segmentUntil });
    cursor = segmentUntil;
  }
  return requests;
}

function formatDateForLabel(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Footer label for a completed window. `until` is exclusive, so the label shows the last included day. */
export function formatCompletedWindowLabel(window: CompletedTaskWindow): string {
  const lastIncluded = new Date(window.until.getTime() - 1);
  return `Completed: ${window.by.replace('_', ' ')} ${formatDateForLabel(window.since)} to ${formatDateForLabel(lastIncluded)}`;
}

export function formatQueryHeader(config: QueryConfig): string {
  if (config.completedOnly) return `Filter: ${config.filter} · completed only`;
  if (config.includeCompleted) return `Filter: ${config.filter} · including completed`;
  return `Filter: ${config.filter}`;
}

function formatCompletedAt(completedAt: string | null): string | null {
  if (!completedAt) return null;
  const date = new Date(completedAt);
  return Number.isNaN(date.getTime()) ? null : formatDateForLabel(date);
}

/**
 * Fetch the tasks for one query block. Normal blocks merge active filter results with the
 * optional completed lookup; completed_only blocks skip the active lookup entirely.
 */
export async function loadQueryTasks(
  config: QueryConfig,
  source: QueryTaskSource,
  now: Date = new Date()
): Promise<QueryTaskResult> {
  const activeTasks = config.completedOnly ? [] : await source.getFilteredTasks(config.filter);
  let completedTasks: TodoistTask[] = [];
  let completedWarning: string | null = null;
  let completedWindow: CompletedTaskWindow | null = null;

  if (config.includeCompleted) {
    try {
      const window = resolveCompletedWindow(config, now);
      completedWindow = window;
      const results: TodoistTask[] = [];
      // Requests run in order; if any fails, none of the completed results are used.
      for (const request of completedWindowRequests(window)) {
        results.push(...await source.getCompletedTasks({
          filterQuery: config.filter,
          by: window.by,
          since: request.since,
          until: request.until,
        }));
      }
      completedTasks = results;
    } catch (completedError) {
      const message = completedError instanceof Error ? completedError.message : String(completedError);
      if (config.completedOnly) throw new CompletedTaskLookupError(message);
      completedWarning = message;
      console.warn('Sync Todoist query block completed task lookup failed:', completedError);
    }
  }

  const tasks = config.completedOnly
    ? mergeTasks([], completedTasks.filter(task => task.isCompleted))
    : mergeTasks(activeTasks, completedTasks);

  return { tasks, completedWindow, completedWarning };
}

function renderTaskRow(
  task: TodoistTask,
  container: HTMLElement,
  plugin: TodoistSyncPlugin,
  depth: number
): void {
  const depthClass = depth > 0
    ? ` syncist-query-subtask syncist-query-depth-${Math.min(depth, MAX_SUBTASK_DEPTH_CLASS)}`
    : '';
  const row = container.createDiv({ cls: `syncist-query-task${depthClass}` });

  const checkbox = row.createEl('input', { type: 'checkbox', cls: 'syncist-query-checkbox' });
  checkbox.checked = task.isCompleted;
  checkbox.addEventListener('change', () => {
    void (async () => {
      try {
        if (checkbox.checked) {
          await plugin.todoistService.completeTask(task.id);
        } else {
          await plugin.todoistService.reopenTask(task.id);
        }
        showSyncTodoistNotice(checkbox.checked ? `Completed: ${task.content}.` : `Reopened: ${task.content}.`);
      } catch (err) {
        console.error('Failed to toggle task:', err);
        showSyncTodoistNotice(`Failed to update task: ${err}`, 10000);
        checkbox.checked = !checkbox.checked;
      }
    })();
  });

  const textContainer = row.createDiv({ cls: 'syncist-query-task-text' });

  const contentEl = textContainer.createSpan({ cls: 'syncist-query-content' });
  const emoji = PRIORITY_EMOJI[task.priority];
  if (emoji) {
    contentEl.createSpan({ text: emoji + ' ', cls: 'syncist-query-priority' });
  }
  contentEl.createSpan({ text: task.content });

  const metaEl = textContainer.createDiv({ cls: 'syncist-query-meta' });
  const badges: string[] = [];

  const projectName = plugin.todoistService.getProjectName(task.projectId);
  if (projectName) badges.push(`📁 ${projectName}`);
  if (task.due) badges.push(`📅 ${formatDueForMarkdown(normalizeTodoistDue(task.due)) ?? task.due.date}`);
  const completedDate = task.isCompleted ? formatCompletedAt(task.completedAt) : null;
  if (completedDate) badges.push(`✅ ${completedDate}`);
  if (task.labels.length) badges.push(task.labels.map(l => `#${l}`).join(' '));

  if (badges.length > 0) {
    metaEl.createSpan({ text: badges.join('  ·  '), cls: 'syncist-query-badge' });
  }
}

function renderTaskTree(
  nodes: TaskTreeNode[],
  container: HTMLElement,
  plugin: TodoistSyncPlugin,
  depth: number
): void {
  for (const node of nodes) {
    renderTaskRow(node.task, container, plugin, depth);
    renderTaskTree(node.children, container, plugin, depth + 1);
  }
}

export function renderQueryBlock(
  source: string,
  el: HTMLElement,
  plugin: TodoistSyncPlugin
): void {
  const { config, error } = parseQueryConfig(source);

  if (!config) {
    el.createDiv({ cls: 'syncist-query-error', text: error ?? 'Invalid Sync Todoist block. Use: filter: today' });
    return;
  }

  if (!plugin.todoistService.isInitialized()) {
    el.createDiv({ cls: 'syncist-query-error', text: 'Todoist API not configured. Add your token in settings.' });
    return;
  }

  const wrapper = el.createDiv({ cls: 'syncist-query-block' });

  const header = wrapper.createDiv({ cls: 'syncist-query-header' });
  header.createSpan({
    text: formatQueryHeader(config),
    cls: 'syncist-query-filter-label',
  });

  const refreshBtn = header.createEl('button', { text: '↻', cls: 'syncist-query-refresh' });
  refreshBtn.setAttribute('aria-label', 'Refresh');

  const listContainer = wrapper.createDiv({ cls: 'syncist-query-list' });
  const footerEl = wrapper.createDiv({ cls: 'syncist-query-footer' });

  const loadTasks = async () => {
    listContainer.empty();
    footerEl.empty();
    listContainer.createDiv({ cls: 'syncist-query-loading', text: 'Loading tasks...' });

    try {
      await plugin.todoistService.ensureProjectCache();
      const { tasks, completedWindow, completedWarning } = await loadQueryTasks(config, plugin.todoistService);
      listContainer.empty();

      if (tasks.length === 0) {
        listContainer.createDiv({
          cls: 'syncist-query-empty',
          text: config.completedOnly
            ? 'No completed tasks match this filter in this date range.'
            : 'No tasks match this filter.',
        });
      } else {
        renderTaskTree(buildTaskTree(tasks), listContainer, plugin, 0);
      }

      footerEl.createSpan({
        text: `Updated: ${new Date().toLocaleTimeString()}`,
        cls: 'syncist-query-timestamp',
      });

      if (completedWindow) {
        footerEl.createDiv({
          text: formatCompletedWindowLabel(completedWindow),
          cls: 'syncist-query-completed-window',
        });
      }

      if (completedWarning) {
        footerEl.createDiv({
          text: `Completed tasks not loaded: ${completedWarning}`,
          cls: 'syncist-query-warning',
        });
      }
    } catch (error) {
      listContainer.empty();
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof CompletedTaskLookupError) {
        console.warn('Sync Todoist query block completed task lookup failed:', message);
        listContainer.createDiv({
          cls: 'syncist-query-error',
          text: `Completed tasks not loaded: ${message}`,
        });
        return;
      }
      const isFilterError = message.toLowerCase().startsWith('invalid filter');
      if (isFilterError) {
        console.warn('Sync Todoist query block: invalid filter —', message);
      } else {
        console.error('Sync Todoist query block error:', error);
      }
      listContainer.createDiv({
        cls: 'syncist-query-error',
        text: isFilterError
          ? `${message}. Check the Todoist filter syntax.`
          : `Failed to load tasks: ${message}`,
      });
    }
  };

  refreshBtn.addEventListener('click', () => {
    void loadTasks();
  });

  void loadTasks();
}
