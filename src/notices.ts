import { Notice } from 'obsidian';
import { DailyNoteSyncResult, NotificationSettings, SyncResult } from './types';

const PREFIX = 'Sync Todoist:';
const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 10000;

export function showSyncTodoistNotice(message: string, duration = DEFAULT_DURATION): Notice {
  return new Notice(`${PREFIX} ${message}`, duration);
}

export function createPersistentSyncNotice(message: string): Notice {
  return new Notice(`${PREFIX} ${message}`, 0);
}

export function setSyncNoticeMessage(notice: Notice, message: string): void {
  notice.setMessage(`${PREFIX} ${message}`);
}

export function formatSyncResult(result: SyncResult): string {
  const parts = [
    `${result.created} created`,
    `${result.updated} updated`,
    `${result.completed} completed`,
    `${result.conflicts} conflicts`,
  ];

  if (result.dailyNote && result.dailyNote.status !== 'disabled') {
    parts.push(formatDailyNoteSummary(result.dailyNote));
  }

  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} errors`);
  }

  return `Sync done: ${parts.join(', ')}.`;
}

export function formatDailyNoteSummary(result: DailyNoteSyncResult): string {
  if (result.status === 'updated') {
    return `daily note ${result.taskCount} tasks`;
  }
  if (result.status === 'skipped_no_tasks') {
    return 'daily note 0 tasks';
  }
  if (result.status === 'skipped_no_file') {
    return 'daily note missing';
  }
  if (result.status === 'daily_plugin_disabled') {
    return 'daily notes off';
  }
  if (result.status === 'invalid_markers') {
    return 'daily note marker error';
  }
  if (result.status === 'error') {
    return 'daily note error';
  }
  return `daily note ${result.status}`;
}

export function shouldShowAutomaticSyncNotice(result: SyncResult, settings: NotificationSettings): boolean {
  if (result.errors.length > 0 || result.conflicts > 0) return true;
  return settings.automaticSync;
}

export function noticeDurationForResult(result: SyncResult): number {
  return result.errors.length > 0 || result.conflicts > 0 ? ERROR_DURATION : DEFAULT_DURATION;
}

export function noticeDurationForDailyNote(result: DailyNoteSyncResult): number {
  return result.status === 'error' || result.status === 'invalid_markers'
    ? ERROR_DURATION
    : DEFAULT_DURATION;
}
