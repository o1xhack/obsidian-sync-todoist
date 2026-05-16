import { updateTaskCompletion } from './task-parser';

export type DailyNoteCleanupMode =
  | 'remove-stale-unfinished'
  | 'mark-completed'
  | 'remove-completed';

export interface DailyNoteCleanupOptions {
  mode: DailyNoteCleanupMode;
  markCompletedAlso: boolean;
}

export interface DailyNoteCleanupTaskState {
  isActive: boolean;
  isCompleted: boolean;
  currentDueDate: string | null;
}

export interface DailyNoteCleanupContentStats {
  scannedTaskRows: number;
  removedStaleUnfinished: number;
  markedCompleted: number;
  removedCompleted: number;
  skippedUnknown: number;
  skippedCompleted: number;
  skippedUnchanged: number;
}

export interface DailyNoteCleanupContentResult {
  content: string;
  changed: boolean;
  stats: DailyNoteCleanupContentStats;
  removedIds: string[];
}

export interface CompletedTaskCleanupRange {
  since: Date;
  until: Date;
}

const EMPTY_CONTENT_STATS: DailyNoteCleanupContentStats = {
  scannedTaskRows: 0,
  removedStaleUnfinished: 0,
  markedCompleted: 0,
  removedCompleted: 0,
  skippedUnknown: 0,
  skippedCompleted: 0,
  skippedUnchanged: 0,
};

export function createEmptyCleanupContentStats(): DailyNoteCleanupContentStats {
  return { ...EMPTY_CONTENT_STATS };
}

export function mergeCleanupContentStats(
  target: DailyNoteCleanupContentStats,
  source: DailyNoteCleanupContentStats
): void {
  target.scannedTaskRows += source.scannedTaskRows;
  target.removedStaleUnfinished += source.removedStaleUnfinished;
  target.markedCompleted += source.markedCompleted;
  target.removedCompleted += source.removedCompleted;
  target.skippedUnknown += source.skippedUnknown;
  target.skippedCompleted += source.skippedCompleted;
  target.skippedUnchanged += source.skippedUnchanged;
}

export function completedTaskCleanupRanges(
  earliestDate: string,
  today: string
): CompletedTaskCleanupRange[] {
  const ranges: CompletedTaskCleanupRange[] = [];
  const finalUntil = new Date(`${today}T00:00:00`);
  finalUntil.setDate(finalUntil.getDate() + 1);

  let cursor = new Date(`${earliestDate}T00:00:00`);
  while (cursor < finalUntil) {
    const since = new Date(cursor);
    const until = new Date(cursor);
    // Todoist completed-task endpoints reject ranges over 6 weeks.
    until.setDate(until.getDate() + 41);
    if (until > finalUntil) until.setTime(finalUntil.getTime());
    ranges.push({ since, until: new Date(until) });
    cursor = until;
  }

  return ranges;
}

export function applyDailyNoteCleanupToContent(
  content: string,
  markerStart: string,
  markerEnd: string,
  dailyNoteDate: string,
  options: DailyNoteCleanupOptions,
  lookupTaskState: (todoistId: string) => DailyNoteCleanupTaskState | null
): DailyNoteCleanupContentResult {
  const lines = content.split('\n');
  const startLine = lines.findIndex(line => line.includes(markerStart));
  if (startLine < 0) {
    return { content, changed: false, stats: createEmptyCleanupContentStats(), removedIds: [] };
  }
  const endLine = lines.findIndex((line, index) => index > startLine && line.includes(markerEnd));
  if (endLine < 0) {
    return { content, changed: false, stats: createEmptyCleanupContentStats(), removedIds: [] };
  }

  const stats = createEmptyCleanupContentStats();
  const nextLines: string[] = [];
  const removedIds: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i <= startLine || i >= endLine) {
      nextLines.push(line);
      continue;
    }

    const parsed = parseCleanupTaskLine(line);
    if (!parsed) {
      nextLines.push(line);
      continue;
    }

    stats.scannedTaskRows++;
    const taskState = lookupTaskState(parsed.todoistId);
    if (!taskState) {
      stats.skippedUnknown++;
      nextLines.push(line);
      continue;
    }

    if (parsed.isCompleted) {
      if (options.mode === 'remove-completed' && taskState.isCompleted) {
        stats.removedCompleted++;
        removedIds.push(parsed.todoistId);
        continue;
      }
      stats.skippedUnchanged++;
      nextLines.push(line);
      continue;
    }

    if (taskState.isCompleted) {
      if (options.mode === 'remove-completed') {
        stats.removedCompleted++;
        removedIds.push(parsed.todoistId);
        continue;
      }
      if (options.mode === 'mark-completed' || (options.mode === 'remove-stale-unfinished' && options.markCompletedAlso)) {
        stats.markedCompleted++;
        nextLines.push(updateTaskCompletion(line, true));
        continue;
      }
      stats.skippedCompleted++;
      nextLines.push(line);
      continue;
    }

    if (options.mode === 'remove-stale-unfinished' && taskState.isActive && taskState.currentDueDate !== dailyNoteDate) {
      stats.removedStaleUnfinished++;
      removedIds.push(parsed.todoistId);
      continue;
    }

    stats.skippedUnchanged++;
    nextLines.push(line);
  }

  const nextContent = nextLines.join('\n');
  return {
    content: nextContent,
    changed: nextContent !== content,
    stats,
    removedIds,
  };
}

function parseCleanupTaskLine(line: string): { todoistId: string; isCompleted: boolean } | null {
  const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+/);
  if (!taskMatch) return null;
  const idMatch = line.match(/<!--\s*todoist-id:\s*([\w]+)\s*-->/);
  if (!idMatch) return null;
  return {
    todoistId: idMatch[1],
    isCompleted: taskMatch[2].toLowerCase() === 'x',
  };
}
