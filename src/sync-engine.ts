import { App, moment, normalizePath, TFile } from 'obsidian';
import { TodoistService } from './todoist-service';
import {
  buildDailyNoteParsedTask,
  buildCompletedRecurringTaskSnapshots,
  buildRecentlyCompletedRecurringTaskSnapshot,
  extractTodoistIdsFromMarkerRegion,
  filterDailyNoteTasks,
  isMarkerRegionValid,
  localTodayISODate,
  renderDailyNoteTaskBlock,
  sortDailyNoteTasks,
  updateDailyNoteContent,
} from './daily-note';
import {
  applyDailyNoteCleanupToContent,
  completedTaskCleanupRanges,
  createEmptyCleanupContentStats,
  DailyNoteCleanupContentStats,
  DailyNoteCleanupOptions,
  DailyNoteCleanupTaskState,
  mergeCleanupContentStats,
} from './daily-note-cleanup';
import {
  countDailyNoteBackfillFile,
  createDailyNoteBackfillResult,
  DailyNoteBackfillFileResult,
  DailyNoteBackfillOptions,
  DailyNoteBackfillResult,
  enumerateDailyNoteBackfillDates,
} from './daily-note-backfill';
import {
  parseTasksFromContent,
  buildTaskLine,
  addTodoistIdToLine,
  updateTaskCompletion,
  generateContentHash,
} from './task-parser';
import {
  ParsedObsidianTask,
  SyncState,
  SyncResult,
  SyncConflict,
  TodoistSyncSettings,
  TodoistTask,
  DailyNoteSyncResult,
} from './types';
import {
  canCompleteTodoistFromGeneratedDailyNote,
  selectTaskForTodoistSync,
  shouldPushDueDateToTodoist,
} from './sync-rules';
import { dueHash, emptyDue, normalizeTodoistDue, todoistDueUpdate } from './due';

interface DailyNotesCorePlugin {
  enabled?: boolean;
  instance?: {
    options?: {
      folder?: string;
      format?: string;
    };
  };
}

interface DailyNoteConfig {
  folder: string;
  format: string;
}

interface DailyNoteSourceSnapshot {
  activeTasks: TodoistTask[];
  completedTasks: TodoistTask[];
  completedActivities: Parameters<typeof buildCompletedRecurringTaskSnapshots>[1];
}

interface DailyNoteWriteOptions {
  date: string;
  dryRun: boolean;
  createMissing: boolean;
}

interface DailyNoteWriteResult {
  filePath?: string;
  taskCount: number;
  status: DailyNoteSyncResult['status'] | 'would_update' | 'would_create' | 'created' | 'unchanged' | 'missing';
  content?: string;
  staleIds: string[];
  message?: string;
}

export interface DailyNoteCleanupFileResult {
  filePath: string;
  date: string;
  scannedTaskRows: number;
  removedStaleUnfinished: number;
  markedCompleted: number;
  removedCompleted: number;
}

export interface DailyNoteCleanupResult {
  mode: DailyNoteCleanupOptions['mode'];
  dryRun: boolean;
  scannedFiles: number;
  eligibleFiles: number;
  changedFiles: number;
  invalidMarkerFiles: number;
  skippedUndatedFiles: number;
  earliestDate: string | null;
  latestDate: string | null;
  stats: DailyNoteCleanupContentStats;
  files: DailyNoteCleanupFileResult[];
  errors: string[];
}

/**
 * Core sync engine for bidirectional Todoist <-> Obsidian sync
 */
export class SyncEngine {
  private app: App;
  private todoistService: TodoistService;
  private settings: TodoistSyncSettings;
  private syncState: SyncState;
  private isSyncing = false;
  private pendingConflicts: SyncConflict[] = [];
  private recentlyCompletedRecurringTasks: TodoistTask[] = [];

  constructor(
    app: App,
    todoistService: TodoistService,
    settings: TodoistSyncSettings,
    syncState: SyncState
  ) {
    this.app = app;
    this.todoistService = todoistService;
    this.settings = settings;
    this.syncState = syncState;
  }

  updateSettings(settings: TodoistSyncSettings): void {
    this.settings = settings;
  }

  updateSyncState(syncState: SyncState): void {
    this.syncState = syncState;
  }

  /**
   * Resolve the display project name for a Todoist task.
   * Returns null when the task is in the configured default project (or inbox
   * when no default is set) so that 📁 is not written to the task line.
   */
  private resolveProjectName(projectId: string): string | null {
    if (this.settings.defaultProjectId) {
      if (projectId === this.settings.defaultProjectId) return null;
    } else {
      if (this.todoistService.isInboxProject(projectId)) return null;
    }
    return this.todoistService.getProjectName(projectId) ?? null;
  }

  getSyncState(): SyncState {
    return this.syncState;
  }

  isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Perform a full bidirectional sync
   */
  async performSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      console.debug('Todoist Sync: Already in progress, skipping...');
      return { created: 0, updated: 0, completed: 0, conflicts: 0, errors: ['Sync already in progress'] };
    }

    if (!this.todoistService.isInitialized()) {
      console.debug('Todoist Sync: API not configured');
      return { created: 0, updated: 0, completed: 0, conflicts: 0, errors: ['Todoist API not configured'] };
    }

    this.isSyncing = true;
    this.recentlyCompletedRecurringTasks = [];
    const result: SyncResult = { created: 0, updated: 0, completed: 0, conflicts: 0, errors: [] };

    try {
      console.debug('Todoist Sync: Starting sync...');

      // Ensure project cache is populated for project name lookups
      await this.todoistService.ensureProjectCache();

      console.debug('Todoist Sync: Fetching Todoist tasks...');
      let todoistTasks: TodoistTask[] = [];
      try {
        todoistTasks = await this.todoistService.getTasks();
        console.debug(`Todoist Sync: Found ${todoistTasks.length} tasks in Todoist`);
      } catch (error) {
        console.error('Todoist Sync: Failed to fetch Todoist tasks:', error);
        result.errors.push(`Failed to fetch Todoist tasks: ${error}`);
        this.isSyncing = false;
        return result;
      }

      const todoistTaskMap = new Map<string, TodoistTask>();
      for (const task of todoistTasks) {
        todoistTaskMap.set(task.id, task);
      }

      console.debug('Todoist Sync: Scanning vault for tasks...');
      const obsidianTasks = await this.getAllObsidianTasks();
      console.debug(`Todoist Sync: Found ${obsidianTasks.length} tasks with ${this.settings.syncTag} tag`);

      const syncedObsidianTaskGroups = new Map<string, ParsedObsidianTask[]>();
      const newObsidianTasks: ParsedObsidianTask[] = [];

      for (const task of obsidianTasks) {
        if (task.todoistId) {
          const group = syncedObsidianTaskGroups.get(task.todoistId) ?? [];
          group.push(task);
          syncedObsidianTaskGroups.set(task.todoistId, group);
        } else if (!task.isDailyNoteGenerated) {
          newObsidianTasks.push(task);
        }
      }

      console.debug(`Todoist Sync: ${newObsidianTasks.length} new tasks to create, ${syncedObsidianTaskGroups.size} existing tasks to sync`);

      // Sort new tasks: parents first (lower indentLevel), then children.
      // This ensures parent Todoist IDs are available when creating subtasks.
      const sortedNewTasks = [...newObsidianTasks].sort((a, b) => a.indentLevel - b.indentLevel);

      // Track newly created tasks so children can reference their Todoist IDs.
      // Maps "filePath:lineNumber" to the created Todoist task ID.
      const createdTaskMap = new Map<string, string>();
      // Also track the IDs themselves so the stale-entry cleanup below does not
      // remove entries that were just added in this sync cycle.
      const newlyCreatedIds = new Set<string>();

      for (let i = 0; i < sortedNewTasks.length; i++) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const task = sortedNewTasks[i];
        try {
          // Resolve parentId: use the task's existing parentId, or look up from
          // a task that was just created in this same sync cycle.
          let parentId = task.parentId;
          if (!parentId && task.indentLevel > 0) {
            parentId = this.findParentTodoistId(task, obsidianTasks, createdTaskMap);
          }

          console.debug(`Todoist Sync: Creating task ${i + 1}/${sortedNewTasks.length}: "${task.content}" (parent: ${parentId ?? 'none'})`);
          const todoistTask = await this.createTodoistTaskWithParent(task, parentId);
          createdTaskMap.set(`${task.filePath}:${task.lineNumber}`, todoistTask.id);
          newlyCreatedIds.add(todoistTask.id);
          result.created++;
        } catch (error) {
          result.errors.push(`Failed to create task: ${task.content} - ${error}`);
          console.error('Todoist Sync: Failed to create task:', error);
        }
      }

      // Sync existing tasks
      const syncedObsidianTasks = new Map<string, ParsedObsidianTask>();
      for (const [todoistId, group] of syncedObsidianTaskGroups.entries()) {
        syncedObsidianTasks.set(todoistId, selectTaskForTodoistSync(group, todoistTaskMap.get(todoistId)));
      }
      const syncEntries = [...syncedObsidianTasks.entries()];
      for (let i = 0; i < syncEntries.length; i++) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const [todoistId, obsidianTask] = syncEntries[i];
        const todoistTask = todoistTaskMap.get(todoistId);

        if (!todoistTask) {
          try {
            console.debug(`Todoist Sync: Task ${todoistId} not found in Todoist, marking completed`);
            await this.markObsidianTaskCompleted(obsidianTask);
            result.completed++;
            delete this.syncState.tasks[todoistId];
          } catch (error) {
            result.errors.push(`Failed to mark task completed: ${obsidianTask.content}`);
            console.error('Todoist Sync: Failed to mark task completed:', error);
          }
          continue;
        }

        try {
          const syncResult = await this.syncExistingTask(obsidianTask, todoistTask);
          if (syncResult === 'updated') result.updated++;
          if (syncResult === 'conflict') result.conflicts++;
          if (syncResult === 'completed') result.completed++;
        } catch (error) {
          result.errors.push(`Failed to sync task: ${obsidianTask.content} - ${error}`);
          console.error('Todoist Sync: Failed to sync existing task:', error);
        }

        if ((i + 1) % 25 === 0 || i === syncEntries.length - 1) {
          console.debug(`Todoist Sync: Synced ${i + 1}/${syncEntries.length} existing tasks`);
        }
      }

      // Clean up sync state for any entry no longer present in Obsidian.
      // This covers tasks whose file was renamed, moved, or deleted, as well
      // as task lines that were manually removed. The Todoist task is left
      // untouched; only the local tracking entry is removed.
      // Entries created during THIS sync cycle are excluded — they were added
      // after the vault scan and therefore won't be in syncedObsidianTasks yet.
      for (const todoistId of Object.keys(this.syncState.tasks)) {
        if (!syncedObsidianTasks.has(todoistId) && !newlyCreatedIds.has(todoistId)) {
          console.debug(`Todoist Sync: Removing stale sync state entry for ${todoistId}`);
          delete this.syncState.tasks[todoistId];
        }
      }

      this.syncState.lastFullSync = Date.now();

      if (this.settings.dailyNote.enabled) {
        try {
          const today = localTodayISODate();
          const freshTasks = await this.getDailyNoteSourceTasks(today);
          result.dailyNote = await this.syncTasksIntoDailyNote(freshTasks, today);
          if (result.dailyNote.status === 'error' || result.dailyNote.status === 'invalid_markers') {
            result.errors.push(result.dailyNote.message ?? 'Daily Note sync failed');
          }
        } catch (error) {
          const message = `Daily Note sync failed: ${error}`;
          result.dailyNote = { status: 'error', taskCount: 0, message };
          result.errors.push(message);
        }
      }

      console.debug('Todoist Sync: Completed!', result);

    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
      console.error('Todoist Sync: Sync failed with error:', error);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Find the Todoist parent ID for a subtask by walking up the indent hierarchy.
   */
  private findParentTodoistId(
    task: ParsedObsidianTask,
    allTasks: ParsedObsidianTask[],
    createdTaskMap: Map<string, string>
  ): string | null {
    // Look backwards through tasks in the same file for the nearest parent
    const samefile = allTasks.filter(t => t.filePath === task.filePath && t.lineNumber < task.lineNumber);
    for (let i = samefile.length - 1; i >= 0; i--) {
      const candidate = samefile[i];
      if (candidate.indentLevel < task.indentLevel) {
        // Found the parent -- return its Todoist ID (existing or newly created)
        if (candidate.todoistId) return candidate.todoistId;
        const key = `${candidate.filePath}:${candidate.lineNumber}`;
        return createdTaskMap.get(key) ?? null;
      }
    }
    return null;
  }

  /**
   * Get all tasks from all markdown files in the vault
   */
  private async getAllObsidianTasks(): Promise<ParsedObsidianTask[]> {
    const tasks: ParsedObsidianTask[] = [];
    const files = this.app.vault.getMarkdownFiles();
    console.debug(`Todoist Sync: Vault has ${files.length} markdown files`);

    for (let i = 0; i < files.length; i++) {
      // Yield every file to keep UI responsive
      await new Promise(resolve => window.setTimeout(resolve, 0));

      const file = files[i];
      try {
        const content = await this.app.vault.cachedRead(file);
        const fileTasks = parseTasksFromContent(
          content,
          file.path,
          this.settings.syncTag,
          file.stat.mtime
        );
        this.markDailyNoteGeneratedTasks(fileTasks, content);
        tasks.push(...fileTasks);
      } catch (error) {
        console.error(`Failed to read file ${file.path}:`, error);
      }
    }

    console.debug(`Todoist Sync: Scan complete — ${files.length} files, ${tasks.length} tasks found`);
    return tasks;
  }

  private markDailyNoteGeneratedTasks(tasks: ParsedObsidianTask[], content: string): void {
    const generatedLines = this.getDailyNoteGeneratedLineNumbers(content);
    if (generatedLines.size === 0) return;
    for (const task of tasks) {
      if (generatedLines.has(task.lineNumber)) {
        task.isDailyNoteGenerated = true;
      }
    }
  }

  private getDailyNoteGeneratedLineNumbers(content: string): Set<number> {
    const generatedLines = new Set<number>();
    const markerStart = this.settings.dailyNote.markerStart;
    const markerEnd = this.settings.dailyNote.markerEnd;
    if (!markerStart || !markerEnd || markerStart === markerEnd) return generatedLines;

    let insideMarker = false;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!insideMarker && lines[i].includes(markerStart)) {
        insideMarker = true;
        continue;
      }
      if (insideMarker && lines[i].includes(markerEnd)) {
        insideMarker = false;
        continue;
      }
      if (insideMarker) generatedLines.add(i);
    }
    return generatedLines;
  }

  async syncDailyNoteNow(): Promise<DailyNoteSyncResult> {
    if (!this.todoistService.isInitialized()) {
      return { status: 'error', taskCount: 0, message: 'Todoist API not configured' };
    }
    await this.todoistService.ensureProjectCache();
    const today = localTodayISODate();
    const tasks = await this.getDailyNoteSourceTasks(today);
    return this.syncTasksIntoDailyNote(tasks, today);
  }

  async previewDailyNoteBackfill(options: DailyNoteBackfillOptions): Promise<DailyNoteBackfillResult> {
    return this.backfillDailyNotes(options, true);
  }

  async applyDailyNoteBackfill(options: DailyNoteBackfillOptions): Promise<DailyNoteBackfillResult> {
    return this.backfillDailyNotes(options, false);
  }

  async previewPastDailyNoteCleanup(options: DailyNoteCleanupOptions): Promise<DailyNoteCleanupResult> {
    return this.cleanupPastDailyNotes(options, true);
  }

  async applyPastDailyNoteCleanup(options: DailyNoteCleanupOptions): Promise<DailyNoteCleanupResult> {
    return this.cleanupPastDailyNotes(options, false);
  }

  private async cleanupPastDailyNotes(
    options: DailyNoteCleanupOptions,
    dryRun: boolean
  ): Promise<DailyNoteCleanupResult> {
    const result: DailyNoteCleanupResult = {
      mode: options.mode,
      dryRun,
      scannedFiles: 0,
      eligibleFiles: 0,
      changedFiles: 0,
      invalidMarkerFiles: 0,
      skippedUndatedFiles: 0,
      earliestDate: null,
      latestDate: null,
      stats: createEmptyCleanupContentStats(),
      files: [],
      errors: [],
    };

    if (!this.todoistService.isInitialized()) {
      result.errors.push('Todoist API not configured');
      return result;
    }

    const config = this.getDailyNoteConfig();
    if (!config) {
      result.errors.push('Enable Obsidian core Daily notes plugin first.');
      return result;
    }

    const today = localTodayISODate();
    const markerStart = this.settings.dailyNote.markerStart;
    const markerEnd = this.settings.dailyNote.markerEnd;
    const candidates: Array<{ file: TFile; content: string; date: string }> = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      result.scannedFiles++;
      try {
        const content = await this.app.vault.cachedRead(file);
        if (!content.includes(markerStart) && !content.includes(markerEnd)) continue;
        if (!isMarkerRegionValid(content, markerStart, markerEnd)) {
          result.invalidMarkerFiles++;
          continue;
        }

        const date = this.dailyNoteDateFromPath(file.path, config);
        if (!date) {
          result.skippedUndatedFiles++;
          continue;
        }
        if (date >= today) continue;

        result.eligibleFiles++;
        result.earliestDate = result.earliestDate ? minIsoDate(result.earliestDate, date) : date;
        result.latestDate = result.latestDate ? maxIsoDate(result.latestDate, date) : date;
        candidates.push({ file, content, date });
      } catch (error) {
        result.errors.push(`Failed to read ${file.path}: ${error}`);
      }
    }

    if (candidates.length === 0 || !result.earliestDate) {
      return result;
    }

    const activeTasks = await this.todoistService.getTasks();
    const activeById = new Map(activeTasks.map(task => [task.id, task]));
    const completedIds = await this.getCompletedTodoistIdsForDailyNoteCleanup(
      result.earliestDate,
      today,
      options,
      result.errors
    );

    for (const candidate of candidates) {
      const cleanup = applyDailyNoteCleanupToContent(
        candidate.content,
        markerStart,
        markerEnd,
        candidate.date,
        options,
        (todoistId) => this.resolveCleanupTaskState(todoistId, activeById, completedIds)
      );

      mergeCleanupContentStats(result.stats, cleanup.stats);
      if (!cleanup.changed) continue;

      result.changedFiles++;
      result.files.push({
        filePath: candidate.file.path,
        date: candidate.date,
        scannedTaskRows: cleanup.stats.scannedTaskRows,
        removedStaleUnfinished: cleanup.stats.removedStaleUnfinished,
        markedCompleted: cleanup.stats.markedCompleted,
        removedCompleted: cleanup.stats.removedCompleted,
      });

      if (!dryRun) {
        await this.app.vault.modify(candidate.file, cleanup.content);
        for (const id of cleanup.removedIds) {
          if (this.syncState.tasks[id]?.filePath === candidate.file.path) {
            delete this.syncState.tasks[id];
          }
        }
      }
    }

    return result;
  }

  private async backfillDailyNotes(
    options: DailyNoteBackfillOptions,
    dryRun: boolean
  ): Promise<DailyNoteBackfillResult> {
    const result = createDailyNoteBackfillResult(options, dryRun);

    if (!this.todoistService.isInitialized()) {
      result.errors.push('Todoist API not configured');
      return result;
    }

    const config = this.getDailyNoteConfig();
    if (!config) {
      result.errors.push('Enable Obsidian core Daily notes plugin first.');
      return result;
    }

    const today = localTodayISODate();
    const dateList = enumerateDailyNoteBackfillDates(options.startDate, options.endDate, today);
    result.scannedDates = dateList.scannedDates;
    result.skippedNonPastDates = dateList.skippedNonPastDates;
    if (dateList.error) {
      result.errors.push(dateList.error);
      return result;
    }
    if (dateList.dates.length === 0) {
      result.errors.push('Backfill range does not contain any past dates.');
      return result;
    }
    result.eligibleDates = dateList.dates.length;

    try {
      await this.todoistService.ensureProjectCache();
    } catch (error) {
      result.errors.push(`Failed to load Todoist projects for Daily Note backfill: ${error}`);
      return result;
    }

    let sourceSnapshot: DailyNoteSourceSnapshot;
    try {
      sourceSnapshot = await this.getDailyNoteSourceSnapshotForDates(dateList.dates, result.errors, result.warnings);
    } catch (error) {
      result.errors.push(`Failed to fetch Todoist tasks for Daily Note backfill: ${error}`);
      return result;
    }
    if (result.errors.length > 0) {
      return result;
    }

    for (const date of dateList.dates) {
      const tasks = this.dailyNoteSourceTasksForDate(date, sourceSnapshot);
      const write = await this.writeTasksIntoDailyNote(tasks, {
        date,
        dryRun,
        createMissing: options.createMissing,
      });
      const fileResult = this.dailyNoteWriteResultToBackfillFile(date, write, dryRun);
      countDailyNoteBackfillFile(result, fileResult);
    }

    return result;
  }

  private dailyNoteWriteResultToBackfillFile(
    date: string,
    write: DailyNoteWriteResult,
    dryRun: boolean
  ): DailyNoteBackfillFileResult {
    if (write.status === 'updated' || write.status === 'would_update') {
      return {
        date,
        filePath: write.filePath ?? '',
        status: dryRun ? 'would_update' : 'updated',
        taskCount: write.taskCount,
        message: write.message,
      };
    }

    if (write.status === 'created' || write.status === 'would_create') {
      return {
        date,
        filePath: write.filePath ?? '',
        status: dryRun ? 'would_create' : 'created',
        taskCount: write.taskCount,
        message: write.message,
      };
    }

    if (write.status === 'skipped_no_file' || write.status === 'missing') {
      return {
        date,
        filePath: write.filePath ?? '',
        status: 'missing',
        taskCount: write.taskCount,
        message: write.message,
      };
    }

    if (write.status === 'invalid_markers') {
      return {
        date,
        filePath: write.filePath ?? '',
        status: 'invalid_markers',
        taskCount: write.taskCount,
        message: write.message,
      };
    }

    if (write.status === 'error' || write.status === 'daily_plugin_disabled' || write.status === 'disabled') {
      return {
        date,
        filePath: write.filePath ?? '',
        status: 'error',
        taskCount: write.taskCount,
        message: write.message ?? `Daily Note backfill failed for ${date}: ${write.status}`,
      };
    }

    return {
      date,
      filePath: write.filePath ?? '',
      status: 'unchanged',
      taskCount: write.taskCount,
      message: write.message,
    };
  }

  private getDailyNoteConfig(): DailyNoteConfig | null {
    const appWithInternal = this.app as App & {
      internalPlugins?: {
        plugins?: Record<string, DailyNotesCorePlugin>;
      };
    };
    const dailyNotesPlugin = appWithInternal.internalPlugins?.plugins?.['daily-notes'];
    if (!dailyNotesPlugin?.enabled) return null;
    const options = dailyNotesPlugin.instance?.options ?? {};
    return {
      format: options.format?.trim() || 'YYYY-MM-DD',
      folder: (options.folder ?? '').trim().replace(/^\/+|\/+$/g, ''),
    };
  }

  private dailyNoteDateFromPath(path: string, config: DailyNoteConfig): string | null {
    const normalizedPath = normalizePath(path);
    const prefix = config.folder ? `${normalizePath(config.folder)}/` : '';
    if (prefix && !normalizedPath.startsWith(prefix)) return null;
    if (!normalizedPath.endsWith('.md')) return null;

    const relative = normalizedPath.slice(prefix.length, -3);
    const parsed = moment(relative, config.format, true);
    if (!parsed.isValid()) return null;
    return parsed.format('YYYY-MM-DD');
  }

  private async getCompletedTodoistIdsForDailyNoteCleanup(
    earliestDate: string,
    today: string,
    options: DailyNoteCleanupOptions,
    errors: string[]
  ): Promise<Set<string>> {
    const needsCompleted =
      options.mode === 'mark-completed' ||
      options.mode === 'remove-completed' ||
      options.markCompletedAlso;
    const completedIds = new Set<string>();
    if (!needsCompleted) return completedIds;

    for (const by of ['completion_date', 'due_date'] as const) {
      for (const range of completedTaskCleanupRanges(earliestDate, today)) {
        try {
          const completedTasks = await this.todoistService.getCompletedTasks({
            by,
            since: range.since,
            until: range.until,
          });
          for (const task of completedTasks) {
            completedIds.add(task.id);
          }
        } catch (error) {
          errors.push(`Failed to fetch completed tasks by ${by}: ${error}`);
          break;
        }
      }
    }

    return completedIds;
  }

  private resolveCleanupTaskState(
    todoistId: string,
    activeById: Map<string, TodoistTask>,
    completedIds: Set<string>
  ): DailyNoteCleanupTaskState | null {
    const activeTask = activeById.get(todoistId);
    if (activeTask) {
      return {
        isActive: true,
        isCompleted: false,
        currentDueDate: normalizeTodoistDue(activeTask.due).date,
      };
    }

    if (completedIds.has(todoistId)) {
      return {
        isActive: false,
        isCompleted: true,
        currentDueDate: null,
      };
    }

    return null;
  }

  private async getDailyNoteSourceTasks(date: string): Promise<TodoistTask[]> {
    const snapshot = await this.getDailyNoteSourceSnapshotForDates([date]);
    return this.dailyNoteSourceTasksForDate(date, snapshot);
  }

  private async getDailyNoteSourceSnapshotForDates(
    dates: string[],
    errors?: string[],
    warnings?: string[]
  ): Promise<DailyNoteSourceSnapshot> {
    const activeTasks = await this.todoistService.getTasks();
    const completedTaskMode = this.settings.dailyNote.completedTaskMode;
    const completedTasks: TodoistTask[] = [];
    const completedActivities: DailyNoteSourceSnapshot['completedActivities'] = [];
    if (completedTaskMode === 'off') {
      return { activeTasks, completedTasks, completedActivities };
    }

    const earliestDate = dates[0];
    const latestDate = dates[dates.length - 1];
    for (const range of completedTaskCleanupRanges(earliestDate, latestDate)) {
      try {
        const tasks = await this.todoistService.getCompletedTasks({
          by: completedTaskMode === 'due-today' ? 'due_date' : 'completion_date',
          since: range.since,
          until: range.until,
        });
        completedTasks.push(...tasks.filter(task => this.settings.dailyNote.includeCompletedRecurring || !task.due?.isRecurring));
      } catch (error) {
        if (!errors) throw error;
        errors.push(`Failed to fetch completed tasks for Daily Note backfill: ${error}`);
        break;
      }
    }

    if (this.settings.dailyNote.includeCompletedRecurring) {
      for (const range of completedTaskCleanupRanges(earliestDate, latestDate)) {
        try {
          completedActivities.push(...await this.todoistService.getCompletedTaskActivities(range.since, range.until));
        } catch (error) {
          const message = `Completed recurring activity lookup unavailable for Daily Note backfill: ${error}`;
          if (warnings) warnings.push(message);
          console.warn('Todoist Sync:', message);
          break;
        }
      }
    }

    return { activeTasks, completedTasks, completedActivities };
  }

  private dailyNoteSourceTasksForDate(date: string, snapshot: DailyNoteSourceSnapshot): TodoistTask[] {
    const byId = new Map<string, TodoistTask>();
    const completedRecurringTasks = this.settings.dailyNote.includeCompletedRecurring
      ? buildCompletedRecurringTaskSnapshots(snapshot.activeTasks, snapshot.completedActivities, date)
      : [];

    for (const task of snapshot.activeTasks) byId.set(task.id, task);
    for (const task of snapshot.completedTasks) byId.set(task.id, task);
    for (const task of completedRecurringTasks) byId.set(task.id, task);
    if (this.settings.dailyNote.includeCompletedRecurring && date === localTodayISODate()) {
      for (const task of this.recentlyCompletedRecurringTasks) byId.set(task.id, task);
    }
    return [...byId.values()];
  }

  private getDailyNotePath(date: string): { status: 'ok'; path: string } | { status: 'daily_plugin_disabled'; message: string } {
    const config = this.getDailyNoteConfig();
    if (!config) {
      return {
        status: 'daily_plugin_disabled',
        message: 'Enable Obsidian core Daily notes plugin first.',
      };
    }

    return {
      status: 'ok',
      path: this.dailyNotePathForDate(date, config),
    };
  }

  private dailyNotePathForDate(date: string, config: DailyNoteConfig): string {
    const filename = moment(date, 'YYYY-MM-DD').format(config.format);
    return normalizePath(config.folder ? `${config.folder}/${filename}.md` : `${filename}.md`);
  }

  private async syncTasksIntoDailyNote(tasks: TodoistTask[], date: string): Promise<DailyNoteSyncResult> {
    const write = await this.writeTasksIntoDailyNote(tasks, {
      date,
      dryRun: false,
      createMissing: false,
    });

    if (write.status === 'disabled') {
      return { status: 'disabled', taskCount: 0 };
    }
    if (write.status === 'daily_plugin_disabled') {
      return { status: 'daily_plugin_disabled', taskCount: 0, message: write.message };
    }
    if (write.status === 'skipped_no_file' || write.status === 'missing') {
      return {
        status: 'skipped_no_file',
        filePath: write.filePath,
        taskCount: write.taskCount,
        message: write.message,
      };
    }
    if (write.status === 'invalid_markers') {
      return {
        status: 'invalid_markers',
        filePath: write.filePath,
        taskCount: write.taskCount,
        message: write.message,
      };
    }
    if (write.status === 'error') {
      return {
        status: 'error',
        filePath: write.filePath,
        taskCount: write.taskCount,
        message: write.message,
      };
    }

    if (write.taskCount === 0) {
      return {
        status: 'skipped_no_tasks',
        filePath: write.filePath,
        taskCount: 0,
        message: `No matching Todoist tasks due on ${date}.`,
      };
    }

    return {
      status: 'updated',
      filePath: write.filePath,
      taskCount: write.taskCount,
      message: `Updated Daily Note with ${write.taskCount} Todoist task(s).`,
    };
  }

  private async writeTasksIntoDailyNote(
    tasks: TodoistTask[],
    options: DailyNoteWriteOptions
  ): Promise<DailyNoteWriteResult> {
    const settings = this.settings.dailyNote;
    if (!settings.enabled) {
      return { status: 'disabled', taskCount: 0, staleIds: [] };
    }

    const pathResult = this.getDailyNotePath(options.date);
    if (pathResult.status !== 'ok') {
      return { status: pathResult.status, taskCount: 0, message: pathResult.message, staleIds: [] };
    }

    const filteredTasks = sortDailyNoteTasks(
      filterDailyNoteTasks(tasks, settings, options.date),
      settings,
      (projectId) => this.resolveProjectName(projectId)
    );
    const block = renderDailyNoteTaskBlock(
      filteredTasks,
      settings.markerStart,
      settings.markerEnd,
      this.settings.syncTag,
      (projectId) => this.resolveProjectName(projectId),
      pathResult.path
    );

    const abstractFile = this.app.vault.getAbstractFileByPath(pathResult.path);
    if (!(abstractFile instanceof TFile)) {
      if (!options.createMissing) {
        return {
          status: 'skipped_no_file',
          filePath: pathResult.path,
          taskCount: filteredTasks.length,
          staleIds: [],
          message: `Daily Note not found: ${pathResult.path}`,
        };
      }

      const content = `${block}\n`;
      if (!options.dryRun) {
        await this.ensureParentFolders(pathResult.path);
        await this.app.vault.create(pathResult.path, content);
        this.recordDailyNoteSyncState(filteredTasks, pathResult.path, content);
      }
      return {
        status: options.dryRun ? 'would_create' : 'created',
        filePath: pathResult.path,
        taskCount: filteredTasks.length,
        content,
        staleIds: [],
        message: options.dryRun
          ? `Would create Daily Note: ${pathResult.path}`
          : `Created Daily Note: ${pathResult.path}`,
      };
    }

    const oldContent = await this.app.vault.read(abstractFile);
    const staleIds = extractTodoistIdsFromMarkerRegion(oldContent, settings.markerStart, settings.markerEnd);
    const update = updateDailyNoteContent(oldContent, settings.markerStart, settings.markerEnd, block);

    if (update.status === 'invalid_markers') {
      return {
        status: 'invalid_markers',
        filePath: pathResult.path,
        taskCount: filteredTasks.length,
        staleIds,
        message: 'Daily Note markers are missing a pair, inverted, empty, or identical.',
      };
    }

    const changed = update.content !== oldContent;
    if (!options.dryRun) {
      if (changed) {
        await this.app.vault.modify(abstractFile, update.content);
      }
      for (const id of staleIds) {
        delete this.syncState.tasks[id];
      }
      this.recordDailyNoteSyncState(filteredTasks, pathResult.path, update.content);
    }

    return {
      status: changed ? (options.dryRun ? 'would_update' : 'updated') : 'unchanged',
      filePath: pathResult.path,
      taskCount: filteredTasks.length,
      content: update.content,
      staleIds,
      message: changed
        ? options.dryRun
          ? `Would update Daily Note: ${pathResult.path}`
          : `Updated Daily Note: ${pathResult.path}`
        : `Daily Note already current: ${pathResult.path}`,
    };
  }

  private recordDailyNoteSyncState(tasks: TodoistTask[], filePath: string, content: string): void {
    const settings = this.settings.dailyNote;
    if (tasks.length === 0) return;
    const markerLine = this.findMarkerLine(content, settings.markerStart);
    const firstTaskLine = markerLine + 1;
    for (let i = 0; i < tasks.length; i++) {
      const todoistTask = tasks[i];
      const obsidianTask = buildDailyNoteParsedTask(
        todoistTask,
        filePath,
        firstTaskLine + i,
        (projectId) => this.resolveProjectName(projectId)
      );
      this.syncState.tasks[todoistTask.id] = {
        todoistId: todoistTask.id,
        parentId: todoistTask.parentId,
        filePath,
        lineNumber: firstTaskLine + i,
        contentHash: generateContentHash(obsidianTask),
        lastSynced: Date.now(),
        obsidianCompleted: todoistTask.isCompleted,
        todoistCompleted: todoistTask.isCompleted,
        projectId: todoistTask.projectId,
      };
    }
  }

  private async ensureParentFolders(path: string): Promise<void> {
    const parts = path.split('/').slice(0, -1);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFile) {
        throw new Error(`Cannot create Daily Note folder because a file exists at ${current}`);
      }
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private findMarkerLine(content: string, markerStart: string): number {
    const idx = content.indexOf(markerStart);
    if (idx <= 0) return 0;
    return content.slice(0, idx).split('\n').length - 1;
  }

  /**
   * Create a Todoist task from an Obsidian task, with optional parentId
   */
  private async createTodoistTaskWithParent(task: ParsedObsidianTask, parentId: string | null): Promise<TodoistTask> {
    // Resolve project ID from project name if provided
    let projectId = this.settings.defaultProjectId || undefined;
    if (task.projectName) {
      const resolvedId = this.todoistService.getProjectIdByName(task.projectName);
      if (resolvedId) projectId = resolvedId;
    }

    const todoistTask = await this.todoistService.createTask(task.content, {
      projectId: parentId ? undefined : projectId, // Subtasks inherit project from parent
      parentId: parentId ?? undefined,
      priority: task.priority,
      dueDate: task.dueDate ?? undefined,
      due: task.due ?? emptyDue(),
      labels: task.labels,
      description: task.description,
    });

    await this.updateObsidianTaskLine(task, (line) => addTodoistIdToLine(line, todoistTask.id));

    this.syncState.tasks[todoistTask.id] = {
      todoistId: todoistTask.id,
      parentId: parentId,
      filePath: task.filePath,
      lineNumber: task.lineNumber,
      contentHash: generateContentHash(task),
      lastSynced: Date.now(),
      obsidianCompleted: task.isCompleted,
      todoistCompleted: todoistTask.isCompleted,
      projectId: todoistTask.projectId,
    };

    if (task.isCompleted) {
      await this.todoistService.completeTask(todoistTask.id);
    }

    return todoistTask;
  }

  /**
   * @deprecated Use createTodoistTaskWithParent instead
   */
  private async createTodoistTask(task: ParsedObsidianTask): Promise<void> {
    await this.createTodoistTaskWithParent(task, task.parentId);
  }

  /**
   * Sync an existing task between Obsidian and Todoist
   */
  private async syncExistingTask(
    obsidianTask: ParsedObsidianTask,
    todoistTask: TodoistTask
  ): Promise<'updated' | 'conflict' | 'completed' | 'unchanged'> {
    const obsidianCompleted = obsidianTask.isCompleted;
    const todoistCompleted = todoistTask.isCompleted;

    if (obsidianTask.isDailyNoteGenerated) {
      if (obsidianCompleted && !todoistCompleted) {
        if (!canCompleteTodoistFromGeneratedDailyNote(obsidianTask, todoistTask)) {
          this.updateCompletionOnlySyncState(todoistTask.id, false, todoistTask);
          return 'unchanged';
        }
        await this.todoistService.completeTask(todoistTask.id);
        this.recordRecentlyCompletedRecurringTask(todoistTask);
        this.updateCompletionOnlySyncState(todoistTask.id, true, todoistTask);
        return 'completed';
      }
      if (!obsidianCompleted && todoistCompleted) {
        await this.markObsidianTaskCompleted(obsidianTask);
        this.updateCompletionOnlySyncState(todoistTask.id, true, todoistTask);
        return 'completed';
      }
      this.updateCompletionOnlySyncState(todoistTask.id, todoistCompleted, todoistTask);
      return 'unchanged';
    }

    // Handle completion status sync
    if (obsidianCompleted !== todoistCompleted) {
      if (obsidianCompleted && !todoistCompleted) {
        await this.todoistService.completeTask(todoistTask.id);
        this.recordRecentlyCompletedRecurringTask(todoistTask);
        this.updateSyncStateTask(todoistTask.id, obsidianTask, true, todoistTask);
        return 'completed';
      } else if (!obsidianCompleted && todoistCompleted) {
        if (this.settings.conflictResolution === 'todoist-wins') {
          await this.markObsidianTaskCompleted(obsidianTask);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, true, todoistTask);
          return 'completed';
        } else if (this.settings.conflictResolution === 'obsidian-wins') {
          await this.todoistService.reopenTask(todoistTask.id);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, false, todoistTask);
          return 'updated';
        } else {
          await this.markObsidianTaskCompleted(obsidianTask);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, true, todoistTask);
          return 'conflict';
        }
      }
    }

    // Check for content changes between Obsidian and Todoist
    const todoistContent = todoistTask.content;
    const todoistPriority = TodoistService.fromTodoistPriority(todoistTask.priority);
    const todoistDueDate = TodoistService.parseDueDate(todoistTask);
    const todoistDue = normalizeTodoistDue(todoistTask.due);

    const contentDiffers = obsidianTask.content !== todoistContent;
    const priorityDiffers = obsidianTask.priority !== todoistPriority;
    const dueDateDiffers = dueHash(obsidianTask.due ?? emptyDue()) !== dueHash(todoistDue);

    const todoistLabels = [...(todoistTask.labels ?? [])].sort();
    const obsidianLabels = [...obsidianTask.labels].sort();
    const labelsDiffer = JSON.stringify(todoistLabels) !== JSON.stringify(obsidianLabels);

    const todoistProjectName = this.todoistService.getProjectName(todoistTask.projectId) ?? null;
    const projectDiffers = todoistProjectName !== (obsidianTask.projectName ?? null);

    const hasChanges = contentDiffers || priorityDiffers || dueDateDiffers || labelsDiffer || projectDiffers;

    if (!hasChanges) {
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, todoistTask);
      return 'unchanged';
    }

    // Determine which side changed since the last sync using the stored content
    // hash. After a successful sync Obsidian and Todoist are identical, so the
    // stored hash represents the last-known state of both sides.
    const storedHash = this.syncState.tasks[todoistTask.id]?.contentHash ?? '';
    const currentObsidianHash = generateContentHash(obsidianTask);

    // Build a comparable hash from the current Todoist state.
    // generateContentHash sorts labels internally, so order doesn't matter.
    const todoistAsObsidian: ParsedObsidianTask = {
      ...obsidianTask,
      content: todoistContent,
      priority: todoistPriority,
      dueDate: todoistDueDate,
      due: todoistDue,
      labels: todoistTask.labels ?? [],
      isCompleted: todoistTask.isCompleted,
      parentId: todoistTask.parentId ?? null,
      projectId: todoistTask.projectId,
    };
    const currentTodoistHash = generateContentHash(todoistAsObsidian);

    const obsidianChanged = currentObsidianHash !== storedHash;
    const todoistChanged = currentTodoistHash !== storedHash;

    // Project moved in Todoist (content hash unchanged on both sides) → pull to Obsidian
    if (projectDiffers && !obsidianChanged && !todoistChanged) {
      await this.updateObsidianTaskFromTodoist(obsidianTask, todoistTask);
      this.updateSyncStateTaskFromTodoist(todoistTask.id, obsidianTask, todoistTask);
      return 'updated';
    }

    // Only Obsidian changed → push to Todoist regardless of conflict policy
    if (obsidianChanged && !todoistChanged) {
      const updates = {
        content: obsidianTask.content,
        priority: obsidianTask.priority,
        labels: obsidianTask.labels,
      };
      const canPushDueDate = shouldPushDueDateToTodoist(obsidianTask, todoistTask, todoistDueDate);
      if (canPushDueDate) {
        Object.assign(updates, todoistDueUpdate(obsidianTask.due ?? emptyDue()));
      }
      const updatedTodoistTask = await this.todoistService.updateTask(todoistTask.id, updates);
      if (dueDateDiffers && !canPushDueDate) {
        await this.updateObsidianTaskFromTodoist(obsidianTask, updatedTodoistTask);
        this.updateSyncStateTaskFromTodoist(todoistTask.id, obsidianTask, updatedTodoistTask);
      } else {
        this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, updatedTodoistTask);
      }
      return 'updated';
    }

    // Only Todoist changed → pull to Obsidian regardless of conflict policy
    if (todoistChanged && !obsidianChanged) {
      await this.updateObsidianTaskFromTodoist(obsidianTask, todoistTask);
      this.updateSyncStateTaskFromTodoist(todoistTask.id, obsidianTask, todoistTask);
      return 'updated';
    }

    // Both sides changed (or hash unavailable) → apply conflict resolution policy
    if (this.settings.conflictResolution === 'obsidian-wins') {
      const updates = {
        content: obsidianTask.content,
        priority: obsidianTask.priority,
        labels: obsidianTask.labels,
      };
      const canPushDueDate = shouldPushDueDateToTodoist(obsidianTask, todoistTask, todoistDueDate);
      if (canPushDueDate) {
        Object.assign(updates, todoistDueUpdate(obsidianTask.due ?? emptyDue()));
      }
      const updatedTodoistTask = await this.todoistService.updateTask(todoistTask.id, updates);
      if (dueDateDiffers && !canPushDueDate) {
        await this.updateObsidianTaskFromTodoist(obsidianTask, updatedTodoistTask);
        this.updateSyncStateTaskFromTodoist(todoistTask.id, obsidianTask, updatedTodoistTask);
      } else {
        this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, updatedTodoistTask);
      }
      return 'updated';
    } else if (this.settings.conflictResolution === 'todoist-wins') {
      await this.updateObsidianTaskFromTodoist(obsidianTask, todoistTask);
      this.updateSyncStateTaskFromTodoist(todoistTask.id, obsidianTask, todoistTask);
      return 'updated';
    } else {
      this.pendingConflicts.push({
        todoistId: todoistTask.id,
        filePath: obsidianTask.filePath,
        lineNumber: obsidianTask.lineNumber,
        obsidianContent: obsidianTask.content,
        todoistContent: todoistContent,
        obsidianCompleted,
        todoistCompleted,
      });
      return 'conflict';
    }
  }

  /**
   * Update sync state for a task
   */
  private updateSyncStateTask(
    todoistId: string,
    obsidianTask: ParsedObsidianTask,
    completed: boolean,
    todoistTask?: TodoistTask
  ): void {
    this.syncState.tasks[todoistId] = {
      todoistId,
      parentId: todoistTask?.parentId ?? obsidianTask.parentId ?? null,
      filePath: obsidianTask.filePath,
      lineNumber: obsidianTask.lineNumber,
      contentHash: generateContentHash(obsidianTask),
      lastSynced: Date.now(),
      obsidianCompleted: completed,
      todoistCompleted: completed,
      projectId: todoistTask?.projectId ?? obsidianTask.projectId ?? null,
    };
  }

  private recordRecentlyCompletedRecurringTask(todoistTask: TodoistTask): void {
    const snapshot = buildRecentlyCompletedRecurringTaskSnapshot(todoistTask, new Date().toISOString());
    if (!snapshot) return;
    const existingIndex = this.recentlyCompletedRecurringTasks.findIndex(task => task.id === snapshot.id);
    if (existingIndex >= 0) {
      this.recentlyCompletedRecurringTasks[existingIndex] = snapshot;
    } else {
      this.recentlyCompletedRecurringTasks.push(snapshot);
    }
  }

  private updateCompletionOnlySyncState(
    todoistId: string,
    completed: boolean,
    todoistTask: TodoistTask
  ): void {
    const existing = this.syncState.tasks[todoistId];
    if (!existing) return;
    this.syncState.tasks[todoistId] = {
      ...existing,
      lastSynced: Date.now(),
      obsidianCompleted: completed,
      todoistCompleted: completed,
      projectId: todoistTask.projectId,
    };
  }

  private updateSyncStateTaskFromTodoist(
    todoistId: string,
    obsidianTask: ParsedObsidianTask,
    todoistTask: TodoistTask
  ): void {
    const projectName = this.resolveProjectName(todoistTask.projectId);
    const todoistAsObsidian: ParsedObsidianTask = {
      ...obsidianTask,
      content: todoistTask.content,
      priority: TodoistService.fromTodoistPriority(todoistTask.priority),
      dueDate: TodoistService.parseDueDate(todoistTask),
      due: normalizeTodoistDue(todoistTask.due),
      isCompleted: todoistTask.isCompleted,
      labels: todoistTask.labels ?? [],
      parentId: todoistTask.parentId ?? null,
      projectId: todoistTask.projectId,
      projectName,
    };
    this.updateSyncStateTask(todoistId, todoistAsObsidian, todoistTask.isCompleted, todoistTask);
  }

  /**
   * Update Obsidian task from Todoist data
   */
  private async updateObsidianTaskFromTodoist(
    obsidianTask: ParsedObsidianTask,
    todoistTask: TodoistTask
  ): Promise<void> {
    const projectName = this.resolveProjectName(todoistTask.projectId);

    const updatedTask: ParsedObsidianTask = {
      ...obsidianTask,
      content: todoistTask.content,
      priority: TodoistService.fromTodoistPriority(todoistTask.priority),
      dueDate: TodoistService.parseDueDate(todoistTask),
      due: normalizeTodoistDue(todoistTask.due),
      isCompleted: todoistTask.isCompleted,
      labels: todoistTask.labels ?? [],
      projectName,
    };

    const newLine = buildTaskLine(updatedTask, this.settings.syncTag);
    await this.replaceLineInFile(obsidianTask.filePath, obsidianTask.lineNumber, newLine);
  }

  /**
   * Mark an Obsidian task as completed
   */
  private async markObsidianTaskCompleted(task: ParsedObsidianTask): Promise<void> {
    await this.updateObsidianTaskLine(task, (line) => updateTaskCompletion(line, true));
  }

  /**
   * Update a specific line in the Obsidian task
   */
  private async updateObsidianTaskLine(
    task: ParsedObsidianTask,
    transform: (line: string) => string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${task.filePath}`);
    }

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    if (task.lineNumber >= lines.length) {
      throw new Error(`Line number out of range: ${task.lineNumber}`);
    }

    lines[task.lineNumber] = transform(lines[task.lineNumber]);
    await this.app.vault.modify(file, lines.join('\n'));
  }

  /**
   * Replace a line in a file
   */
  private async replaceLineInFile(
    filePath: string,
    lineNumber: number,
    newLine: string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    if (lineNumber >= lines.length) {
      throw new Error(`Line number out of range: ${lineNumber}`);
    }

    lines[lineNumber] = newLine;
    await this.app.vault.modify(file, lines.join('\n'));
  }

  /**
   * Import a Todoist task (and its subtasks) at the cursor position in a file.
   * Returns the number of lines inserted.
   */
  async importTaskAtCursor(
    task: TodoistTask,
    subtasks: TodoistTask[],
    filePath: string,
    lineNumber: number
  ): Promise<number> {
    const projectName = this.resolveProjectName(task.projectId);

    const parentParsed: ParsedObsidianTask = {
      originalLine: '',
      lineNumber,
      filePath,
      content: task.content,
      isCompleted: task.isCompleted,
      todoistId: task.id,
      parentId: task.parentId ?? null,
      indentLevel: 0,
      dueDate: TodoistService.parseDueDate(task),
      due: normalizeTodoistDue(task.due),
      priority: TodoistService.fromTodoistPriority(task.priority),
      labels: task.labels ?? [],
      description: task.description ?? '',
      projectId: task.projectId,
      projectName,
      lastModified: Date.now(),
    };

    const lines: string[] = [buildTaskLine(parentParsed, this.settings.syncTag)];

    // Add to sync state
    this.syncState.tasks[task.id] = {
      todoistId: task.id,
      parentId: task.parentId ?? null,
      filePath,
      lineNumber,
      contentHash: generateContentHash(parentParsed),
      lastSynced: Date.now(),
      obsidianCompleted: task.isCompleted,
      todoistCompleted: task.isCompleted,
      projectId: task.projectId,
    };

    // Build subtask lines
    for (let i = 0; i < subtasks.length; i++) {
      const sub = subtasks[i];
      const subParsed: ParsedObsidianTask = {
        originalLine: '',
        lineNumber: lineNumber + 1 + i,
        filePath,
        content: sub.content,
        isCompleted: sub.isCompleted,
        todoistId: sub.id,
        parentId: sub.parentId ?? task.id,
        indentLevel: 1,
        dueDate: TodoistService.parseDueDate(sub),
        due: normalizeTodoistDue(sub.due),
        priority: TodoistService.fromTodoistPriority(sub.priority),
        labels: sub.labels ?? [],
        description: sub.description ?? '',
        projectId: sub.projectId,
        projectName: null,
        lastModified: Date.now(),
      };

      lines.push(buildTaskLine(subParsed, this.settings.syncTag));

      this.syncState.tasks[sub.id] = {
        todoistId: sub.id,
        parentId: sub.parentId ?? task.id,
        filePath,
        lineNumber: lineNumber + 1 + i,
        contentHash: generateContentHash(subParsed),
        lastSynced: Date.now(),
        obsidianCompleted: sub.isCompleted,
        todoistCompleted: sub.isCompleted,
        projectId: sub.projectId,
      };
    }

    // Insert lines into the file
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = await this.app.vault.read(file);
    const fileLines = fileContent.split('\n');
    fileLines.splice(lineNumber, 0, ...lines);
    await this.app.vault.modify(file, fileLines.join('\n'));

    return lines.length;
  }

  /**
   * Create a Todoist task from the current editor line
   */
  async createTaskFromLine(
    filePath: string,
    lineNumber: number,
    lineContent: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.todoistService.isInitialized()) {
      return { success: false, message: 'Todoist API not configured. Please add your API key in settings.' };
    }

    const taskMatch = lineContent.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    
    let content: string;
    let isTask = false;
    let prefix = '';

    if (taskMatch) {
      isTask = true;
      prefix = taskMatch[1];
      content = taskMatch[3];
      
      const todoistIdMatch = content.match(/<!--\s*todoist-id:\s*([\w]+)\s*-->/);
      if (todoistIdMatch) {
        return { success: false, message: 'Task is already synced with Todoist.' };
      }

      const syncTagPattern = new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!syncTagPattern.test(content)) {
        content = content.trim() + ' ' + this.settings.syncTag;
      }
    } else {
      const trimmed = lineContent.trim();
      if (!trimmed) {
        return { success: false, message: 'Cannot create task from empty line.' };
      }
      
      let cleanedContent = trimmed
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim();
      
      if (!cleanedContent) {
        return { success: false, message: 'Cannot create task from empty bullet.' };
      }
      
      content = cleanedContent + ' ' + this.settings.syncTag;
      prefix = lineContent.match(/^(\s*)/)?.[1] ?? '';
    }

    const cleanContent = content
      .replace(new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
      .replace(/#[a-zA-Z0-9_-]+/g, '')
      .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
      .replace(/🔺|⏫|🔼|🔽/g, '')
      .replace(/📁\s*\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    try {
      const todoistTask = await this.todoistService.createTask(cleanContent, {
        projectId: this.settings.defaultProjectId || undefined,
      });

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return { success: false, message: 'File not found.' };
      }

      const fileContent = await this.app.vault.read(file);
      const lines = fileContent.split('\n');

      let newLine: string;
      if (isTask) {
        newLine = addTodoistIdToLine(lineContent, todoistTask.id);
        if (!new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(newLine)) {
          newLine = newLine.replace(/(\s*)<!--/, ` ${this.settings.syncTag}$1<!--`);
        }
      } else {
        newLine = `${prefix}- [ ] ${content} <!-- todoist-id:${todoistTask.id} -->`;
      }

      lines[lineNumber] = newLine;
      await this.app.vault.modify(file, lines.join('\n'));

      this.syncState.tasks[todoistTask.id] = {
        todoistId: todoistTask.id,
        parentId: null,
        filePath,
        lineNumber,
        contentHash: '',
        lastSynced: Date.now(),
        obsidianCompleted: false,
        todoistCompleted: false,
        projectId: todoistTask.projectId,
      };

      return { success: true, message: `Created Todoist task: ${cleanContent}` };
    } catch (error) {
      console.error('Failed to create Todoist task:', error);
      return { success: false, message: `Failed to create task: ${error}` };
    }
  }

  getPendingConflicts(): SyncConflict[] {
    return this.pendingConflicts;
  }

  clearPendingConflicts(): void {
    this.pendingConflicts = [];
  }
}

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
}
