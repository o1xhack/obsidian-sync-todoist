export interface DailyNoteBackfillOptions {
  startDate: string;
  endDate: string;
  createMissing: boolean;
}

export type DailyNoteBackfillFileStatus =
  | 'would_update'
  | 'updated'
  | 'would_create'
  | 'created'
  | 'unchanged'
  | 'missing'
  | 'invalid_markers'
  | 'skipped_not_past'
  | 'error';

export interface DailyNoteBackfillFileResult {
  date: string;
  filePath: string;
  status: DailyNoteBackfillFileStatus;
  taskCount: number;
  message?: string;
}

export interface DailyNoteBackfillResult {
  dryRun: boolean;
  startDate: string;
  endDate: string;
  scannedDates: number;
  eligibleDates: number;
  changedFiles: number;
  createdFiles: number;
  missingFiles: number;
  unchangedFiles: number;
  invalidMarkerFiles: number;
  skippedNonPastDates: number;
  taskRows: number;
  files: DailyNoteBackfillFileResult[];
  errors: string[];
  warnings: string[];
}

export const DAILY_NOTE_BACKFILL_LIMITATION =
  'Historical backfill can only use active Todoist tasks, completed-task archive results, and available activity-log snapshots. It cannot reconstruct moved or unfinished historical rows that Todoist no longer proves.';

export function createDailyNoteBackfillResult(
  options: DailyNoteBackfillOptions,
  dryRun: boolean
): DailyNoteBackfillResult {
  return {
    dryRun,
    startDate: options.startDate,
    endDate: options.endDate,
    scannedDates: 0,
    eligibleDates: 0,
    changedFiles: 0,
    createdFiles: 0,
    missingFiles: 0,
    unchangedFiles: 0,
    invalidMarkerFiles: 0,
    skippedNonPastDates: 0,
    taskRows: 0,
    files: [],
    errors: [],
    warnings: [DAILY_NOTE_BACKFILL_LIMITATION],
  };
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export function compareISODate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function addDaysISO(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function enumerateDailyNoteBackfillDates(
  startDate: string,
  endDate: string,
  today: string
): { dates: string[]; scannedDates: number; skippedNonPastDates: number; error?: string } {
  if (!isISODate(startDate) || !isISODate(endDate)) {
    return {
      dates: [],
      scannedDates: 0,
      skippedNonPastDates: 0,
      error: 'Backfill dates must use YYYY-MM-DD.',
    };
  }

  if (compareISODate(startDate, endDate) > 0) {
    return {
      dates: [],
      scannedDates: 0,
      skippedNonPastDates: 0,
      error: 'Backfill start date must be on or before end date.',
    };
  }

  const dates: string[] = [];
  let scannedDates = 0;
  let skippedNonPastDates = 0;
  let cursor = startDate;
  while (compareISODate(cursor, endDate) <= 0) {
    scannedDates++;
    if (compareISODate(cursor, today) < 0) {
      dates.push(cursor);
    } else {
      skippedNonPastDates++;
    }
    cursor = addDaysISO(cursor, 1);
  }

  return { dates, scannedDates, skippedNonPastDates };
}

export function countDailyNoteBackfillFile(
  result: DailyNoteBackfillResult,
  file: DailyNoteBackfillFileResult
): void {
  result.files.push(file);
  result.taskRows += file.taskCount;

  if (file.status === 'would_update' || file.status === 'updated') {
    result.changedFiles++;
  } else if (file.status === 'would_create' || file.status === 'created') {
    result.createdFiles++;
  } else if (file.status === 'missing') {
    result.missingFiles++;
  } else if (file.status === 'unchanged') {
    result.unchangedFiles++;
  } else if (file.status === 'invalid_markers') {
    result.invalidMarkerFiles++;
  } else if (file.status === 'skipped_not_past') {
    result.skippedNonPastDates++;
  } else if (file.status === 'error' && file.message) {
    result.errors.push(file.message);
  }
}
