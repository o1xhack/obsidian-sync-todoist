import {
  DEFAULT_DAILY_NOTE_MARKER_END,
  DEFAULT_DAILY_NOTE_MARKER_START,
  DailyNoteSettings,
  ParsedObsidianTask,
  TodoistPriority,
  TodoistTask,
} from './types';
import { buildTaskLine } from './task-parser';
import { normalizeTodoistDue } from './due';

export const DAILY_NOTE_DEFAULT_MARKER_START = DEFAULT_DAILY_NOTE_MARKER_START;
export const DAILY_NOTE_DEFAULT_MARKER_END = DEFAULT_DAILY_NOTE_MARKER_END;

export interface DailyNoteContentUpdate {
  content: string;
  status: 'appended' | 'replaced' | 'unchanged' | 'invalid_markers';
}

export interface DailyNoteTaskFilter {
  today: string;
  projectIds: string[];
  labels: string[];
  priorities: TodoistPriority[];
  includeCompleted: boolean;
}

export interface DailyNoteCompletionActivity {
  objectId: string;
  v2ObjectId?: string;
  eventDate: string;
  extraData: Record<string, unknown> | null;
}

export function localTodayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isMarkerPairConfigValid(markerStart: string, markerEnd: string): boolean {
  return markerStart.length > 0 && markerEnd.length > 0 && markerStart !== markerEnd;
}

export function isMarkerRegionValid(content: string, markerStart: string, markerEnd: string): boolean {
  if (!isMarkerPairConfigValid(markerStart, markerEnd)) return false;
  const startIdx = content.indexOf(markerStart);
  if (startIdx === -1) return false;
  const endIdx = content.indexOf(markerEnd, startIdx + markerStart.length);
  return endIdx !== -1;
}

function hasAnyMarker(content: string, markerStart: string, markerEnd: string): boolean {
  return content.includes(markerStart) || content.includes(markerEnd);
}

export function replaceMarkerBlock(
  content: string,
  markerStart: string,
  markerEnd: string,
  newBlock: string
): string {
  const startIdx = content.indexOf(markerStart);
  const endIdx = content.indexOf(markerEnd, startIdx + markerStart.length);
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + markerEnd.length);
  return before + newBlock + after;
}

export function appendMarkerBlock(content: string, newBlock: string): string {
  const trimmed = content.replace(/\s+$/, '');
  return trimmed.length > 0 ? `${trimmed}\n\n${newBlock}\n` : `${newBlock}\n`;
}

export function updateDailyNoteContent(
  content: string,
  markerStart: string,
  markerEnd: string,
  newBlock: string
): DailyNoteContentUpdate {
  if (!isMarkerPairConfigValid(markerStart, markerEnd)) {
    return { content, status: 'invalid_markers' };
  }

  if (isMarkerRegionValid(content, markerStart, markerEnd)) {
    const next = replaceMarkerBlock(content, markerStart, markerEnd, newBlock);
    return { content: next, status: next === content ? 'unchanged' : 'replaced' };
  }

  if (hasAnyMarker(content, markerStart, markerEnd)) {
    return { content, status: 'invalid_markers' };
  }

  return { content: appendMarkerBlock(content, newBlock), status: 'appended' };
}

export function extractTodoistIdsFromMarkerRegion(
  content: string,
  markerStart: string,
  markerEnd: string
): string[] {
  if (!isMarkerRegionValid(content, markerStart, markerEnd)) return [];
  const startIdx = content.indexOf(markerStart);
  const endIdx = content.indexOf(markerEnd, startIdx + markerStart.length);
  const region = content.slice(startIdx + markerStart.length, endIdx);
  const ids: string[] = [];
  const pattern = /<!--\s*todoist-id:\s*([\w]+)\s*-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(region)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

export function taskMatchesDailyNoteFilter(task: TodoistTask, filter: DailyNoteTaskFilter): boolean {
  if (task.isCompleted) {
    if (!filter.includeCompleted) return false;
    if (localDateFromTimestamp(task.completedAt) !== filter.today) return false;
  } else if (localDateFromTodoistDue(task.due) !== filter.today) {
    return false;
  }

  if (filter.projectIds.length > 0 && !filter.projectIds.includes(task.projectId)) {
    return false;
  }

  if (filter.labels.length > 0) {
    const taskLabels = new Set((task.labels ?? []).map(label => label.toLowerCase()));
    const hasSelectedLabel = filter.labels.some(label => taskLabels.has(label.toLowerCase()));
    if (!hasSelectedLabel) return false;
  }

  if (filter.priorities.length > 0 && !filter.priorities.includes(task.priority)) {
    return false;
  }

  return true;
}

function localDateFromTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return localTodayISODate(date);
}

function localDateFromTodoistDue(due: TodoistTask['due']): string | null {
  if (!due) return null;
  if (due.datetime) {
    return localDateFromTimestamp(due.datetime) ?? datePrefix(due.datetime);
  }
  if (!due.date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due.date)) return due.date;
  return localDateFromTimestamp(due.date) ?? datePrefix(due.date);
}

function datePrefix(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function buildCompletedRecurringTaskSnapshots(
  activeTasks: TodoistTask[],
  completedActivities: DailyNoteCompletionActivity[],
  today: string
): TodoistTask[] {
  const activeById = new Map(activeTasks.map(task => [task.id, task]));
  const snapshots: TodoistTask[] = [];
  const seen = new Set<string>();

  for (const activity of completedActivities) {
    if (localDateFromTimestamp(activity.eventDate) !== today) continue;
    const activeTask = activeById.get(activity.objectId) ?? (activity.v2ObjectId ? activeById.get(activity.v2ObjectId) : undefined);
    if (!activeTask || !activeTask.due?.isRecurring || seen.has(activity.objectId)) continue;

    const occurrenceDate = activityDueValue(activity.extraData) ?? today;
    snapshots.push({
      ...activeTask,
      content: activityContent(activity.extraData) ?? activeTask.content,
      due: {
        ...activeTask.due,
        date: occurrenceDate,
        datetime: undefined,
      },
      isCompleted: true,
      completedAt: activity.eventDate,
    });
    seen.add(activity.objectId);
  }

  return snapshots;
}

export function buildRecentlyCompletedRecurringTaskSnapshot(
  task: TodoistTask,
  completedAt: string
): TodoistTask | null {
  if (!task.due?.isRecurring) return null;
  return {
    ...task,
    isCompleted: true,
    completedAt,
  };
}

function activityContent(extraData: Record<string, unknown> | null): string | null {
  const content = extraData?.content;
  return typeof content === 'string' && content.trim() ? content : null;
}

function activityDueValue(extraData: Record<string, unknown> | null): string | null {
  return (
    dueValueToDateTime(extraData?.completed_due_date_local) ??
    dueValueToDateTime(extraData?.completed_due_date) ??
    dueValueToDateTime(extraData?.last_due_date) ??
    dueValueToDateTime(extraData?.due_date)
  );
}

function dueValueToDateTime(value: unknown): string | null {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value;
    return localDateFromTimestamp(value) ?? datePrefix(value);
  }
  if (value && typeof value === 'object' && 'date' in value) {
    const date = (value as { date?: unknown }).date;
    if (typeof date !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(date)) return date;
    return localDateFromTimestamp(date) ?? datePrefix(date);
  }
  return null;
}

export function filterDailyNoteTasks(tasks: TodoistTask[], settings: DailyNoteSettings, today: string): TodoistTask[] {
  const filter: DailyNoteTaskFilter = {
    today,
    projectIds: settings.projectIds,
    labels: settings.labels,
    priorities: settings.priorities,
    includeCompleted: settings.includeCompleted,
  };
  return tasks.filter(task => taskMatchesDailyNoteFilter(task, filter));
}

export function sortDailyNoteTasks(
  tasks: TodoistTask[],
  settings: DailyNoteSettings,
  resolveProjectName: (projectId: string) => string | null
): TodoistTask[] {
  return [...tasks].sort((a, b) => compareDailyNoteTasks(a, b, settings, resolveProjectName));
}

function compareDailyNoteTasks(
  a: TodoistTask,
  b: TodoistTask,
  settings: DailyNoteSettings,
  resolveProjectName: (projectId: string) => string | null
): number {
  const primary = settings.sortMode === 'priority'
    ? comparePriority(a, b) || compareTime(a, b)
    : compareTime(a, b) || comparePriority(a, b);
  if (primary !== 0) return primary;

  const aProject = resolveProjectName(a.projectId) ?? a.projectId;
  const bProject = resolveProjectName(b.projectId) ?? b.projectId;
  return (
    aProject.localeCompare(bProject) ||
    a.content.localeCompare(b.content) ||
    a.id.localeCompare(b.id)
  );
}

function comparePriority(a: TodoistTask, b: TodoistTask): number {
  return b.priority - a.priority;
}

function compareTime(a: TodoistTask, b: TodoistTask): number {
  const aTime = getDueTimeMinutes(a);
  const bTime = getDueTimeMinutes(b);
  if (aTime === bTime) return 0;
  return aTime < bTime ? -1 : 1;
}

function getDueTimeMinutes(task: TodoistTask): number {
  const datetime = task.due?.datetime;
  if (!datetime) return Number.POSITIVE_INFINITY;
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return date.getHours() * 60 + date.getMinutes();
}

export function renderDailyNoteTaskBlock(
  tasks: TodoistTask[],
  markerStart: string,
  markerEnd: string,
  syncTag: string,
  resolveProjectName: (projectId: string) => string | null,
  filePath: string
): string {
  const lines = tasks.map((task, index) => {
    const parsed = buildDailyNoteParsedTask(task, filePath, index, resolveProjectName);
    return buildTaskLine(parsed, syncTag);
  });

  return lines.length > 0
    ? `${markerStart}\n${lines.join('\n')}\n${markerEnd}`
    : `${markerStart}\n${markerEnd}`;
}

export function buildDailyNoteParsedTask(
  task: TodoistTask,
  filePath: string,
  lineNumber: number,
  resolveProjectName: (projectId: string) => string | null
): ParsedObsidianTask {
  return {
    originalLine: '',
    lineNumber,
    filePath,
    content: task.content,
    isCompleted: task.isCompleted,
    todoistId: task.id,
    parentId: task.parentId,
    indentLevel: 0,
    dueDate: localDateFromTodoistDue(task.due),
    due: normalizeTodoistDue(task.due),
    priority: task.priority,
    labels: task.labels ?? [],
    description: task.description ?? '',
    projectId: task.projectId,
    projectName: resolveProjectName(task.projectId),
    lastModified: Date.now(),
  };
}
