import {
  DailyNoteCompletedTaskMode,
  DailyNoteSettings,
  DEFAULT_SETTINGS,
} from './types';

export type PersistedDailyNoteSettings = Partial<DailyNoteSettings> & {
  includeCompleted?: unknown;
  completedTaskMode?: unknown;
};

function isDailyNoteCompletedTaskMode(value: unknown): value is DailyNoteCompletedTaskMode {
  return value === 'off' || value === 'due-today' || value === 'completed-today';
}

export function normalizeDailyNoteSettings(settings: PersistedDailyNoteSettings | undefined): DailyNoteSettings {
  const merged = {
    ...DEFAULT_SETTINGS.dailyNote,
    ...(settings ?? {}),
  };
  const completedTaskMode = isDailyNoteCompletedTaskMode(settings?.completedTaskMode)
    ? settings.completedTaskMode
    : settings?.includeCompleted === true
      ? 'completed-today'
      : DEFAULT_SETTINGS.dailyNote.completedTaskMode;

  return {
    enabled: merged.enabled,
    markerStart: merged.markerStart,
    markerEnd: merged.markerEnd,
    projectIds: merged.projectIds,
    labels: merged.labels,
    priorities: merged.priorities,
    sortMode: merged.sortMode,
    completedTaskMode,
    includeCompletedRecurring: completedTaskMode === 'off' ? false : merged.includeCompletedRecurring,
  };
}
