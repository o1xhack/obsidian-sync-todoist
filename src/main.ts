import { App, Editor, MarkdownView, Plugin } from 'obsidian';
import { TodoistSyncSettingTab } from './settings';
import { TodoistService } from './todoist-service';
import { SyncEngine } from './sync-engine';
import { ImportTaskModal } from './import-modal';
import { renderQueryBlock } from './query-renderer';
import { entryForVersion, isVersionNewer, RECENT_UPDATE_HIGHLIGHTS } from './release-log';
import { WhatsNewModal } from './whats-new-modal';
import {
  createPersistentSyncNotice,
  formatDailyNoteSummary,
  formatSyncResult,
  noticeDurationForDailyNote,
  noticeDurationForResult,
  setSyncNoticeMessage,
  shouldShowAutomaticSyncNotice,
  showSyncTodoistNotice,
} from './notices';
import {
  TodoistSyncSettings,
  DEFAULT_SETTINGS,
  SyncState,
  DEFAULT_SYNC_STATE,
  SyncResult,
  DailyNoteSyncResult,
} from './types';
import { normalizeDailyNoteSettings, PersistedDailyNoteSettings } from './settings-normalization';

type PersistedPluginData = Partial<Omit<TodoistSyncSettings, 'dailyNote'>> & {
  dailyNote?: PersistedDailyNoteSettings;
  syncState?: SyncState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Todoist Sync Plugin for Obsidian
 * 
 * Enables bidirectional sync between Obsidian tasks tagged with #todoist and Todoist.
 */
export default class TodoistSyncPlugin extends Plugin {
  settings: TodoistSyncSettings;
  todoistService: TodoistService;
  private syncEngine: SyncEngine;
  private syncState: SyncState;
  private syncIntervalId: number | null = null;
  private statusBarItem: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.debug('Loading Sync Todoist plugin...');

    // Load settings and sync state
    await this.loadSettings();
    await this.loadSyncState();

    // Initialize services
    this.todoistService = new TodoistService();
    if (this.settings.apiToken) {
      this.todoistService.initialize(this.settings.apiToken);
    }

    // Initialize sync engine
    this.syncEngine = new SyncEngine(
      this.app,
      this.todoistService,
      this.settings,
      this.syncState
    );

    // Add settings tab
    this.addSettingTab(new TodoistSyncSettingTab(this.app, this));

    // Add status bar item
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();

    // Register commands
    this.registerCommands();

    // Register query block processors. Keep the original syncist block name as a migration alias.
    this.registerMarkdownCodeBlockProcessor('sync-todoist', (source, el) => {
      renderQueryBlock(source, el, this);
    });
    this.registerMarkdownCodeBlockProcessor('syncist', (source, el) => {
      renderQueryBlock(source, el, this);
    });

    // Start sync interval
    this.startSyncInterval();

    this.maybeShowWhatsNewModal();

    console.debug('Sync Todoist plugin loaded');
  }

  onunload(): void {
    console.debug('Unloading Sync Todoist plugin...');
    
    // Stop sync interval
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Register plugin commands
   */
  private registerCommands(): void {
    // Command: Create Todoist task from current line
    this.addCommand({
      id: 'create-todoist-task',
      name: 'Create task from current line',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const filePath = view.file?.path;

        if (!filePath) {
          showSyncTodoistNotice('Cannot determine file path.');
          return;
        }

        const result = await this.syncEngine.createTaskFromLine(
          filePath,
          cursor.line,
          line
        );

        showSyncTodoistNotice(result.message);
        
        if (result.success) {
          // Refresh the editor to show updated line
          const newContent = await this.app.vault.read(view.file!);
          editor.setValue(newContent);
          editor.setCursor(cursor);
          
          // Save sync state
          await this.saveSyncState();
        }
      },
    });

    // Command: Sync now
    this.addCommand({
      id: 'sync-now',
      name: 'Sync now',
      callback: async () => {
        if (!this.settings.apiToken) {
          showSyncTodoistNotice('Please configure your API token in settings.');
          return;
        }

        if (this.syncEngine.isCurrentlySyncing()) {
          showSyncTodoistNotice('Sync already in progress.');
          return;
        }

        await this.runSyncWithNotice('manual');
      },
    });

    // Command: Import task from Todoist
    this.addCommand({
      id: 'import-todoist-task',
      name: 'Import task from todoist',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (!this.settings.apiToken) {
          showSyncTodoistNotice('Please configure your API token in settings.');
          return;
        }

        const filePath = view.file?.path;
        if (!filePath) {
          showSyncTodoistNotice('Cannot determine file path.');
          return;
        }

        const cursor = editor.getCursor();

        new ImportTaskModal(this.app, this.todoistService, (task, subtasks) => {
          void (async () => {
            try {
              const linesInserted = await this.syncEngine.importTaskAtCursor(
                task,
                subtasks,
                filePath,
                cursor.line
              );

              const newContent = await this.app.vault.read(view.file!);
              editor.setValue(newContent);
              editor.setCursor({ line: cursor.line + linesInserted, ch: 0 });

              await this.saveSyncState();

              const subtaskMsg = subtasks.length > 0 ? ` (+${subtasks.length} subtask${subtasks.length > 1 ? 's' : ''})` : '';
              showSyncTodoistNotice(`Imported: ${task.content}${subtaskMsg}.`);
            } catch (error) {
              console.error('Failed to import task:', error);
              showSyncTodoistNotice(`Failed to import task: ${error}`, 10000);
            }
          })();
        }).open();
      },
    });

    // Command: Open Todoist Sync settings
    this.addCommand({
      id: 'open-settings',
      name: 'Open settings',
      callback: () => {
        const appWithSettings = this.app as App & { 
          setting?: { open: () => void; openTabById: (id: string) => void } 
        };
        if (appWithSettings.setting) {
          appWithSettings.setting.open();
          appWithSettings.setting.openTabById('sync-todoist');
        }
      },
    });

    // Command: Sync today's Daily Note
    this.addCommand({
      id: 'sync-daily-note-today',
      name: 'Sync today\'s daily note',
      callback: async () => {
        if (!this.settings.apiToken) {
          showSyncTodoistNotice('Please configure your API token in settings.');
          return;
        }

        const result = await this.syncDailyNoteNow();
        if (result.status === 'updated') {
          showSyncTodoistNotice(
            `Daily note updated: ${result.taskCount} task(s).`,
            noticeDurationForDailyNote(result)
          );
        } else {
          showSyncTodoistNotice(
            result.message ?? `Daily note not updated: ${formatDailyNoteSummary(result)}.`,
            noticeDurationForDailyNote(result)
          );
        }
      },
    });
  }

  /**
   * Load plugin settings
   */
  async loadSettings(): Promise<void> {
    const data = await this.loadPluginData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      dailyNote: normalizeDailyNoteSettings(data?.dailyNote),
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(data?.notifications ?? {}),
      },
    };
  }

  /**
   * Save plugin settings
   */
  async saveSettings(): Promise<void> {
    const data = await this.loadPluginData();
    await this.saveData({
      ...data,
      ...this.settings,
      syncState: this.syncEngine?.getSyncState() ?? this.syncState,
    });
    
    // Update services with new settings
    if (this.settings.apiToken) {
      this.todoistService.initialize(this.settings.apiToken);
    }
    
    if (this.syncEngine) {
      this.syncEngine.updateSettings(this.settings);
    }
  }

  /**
   * Load sync state
   */
  private async loadSyncState(): Promise<void> {
    const data = await this.loadPluginData();
    this.syncState = data?.syncState ?? { ...DEFAULT_SYNC_STATE };
  }

  /**
   * Save sync state
   */
  async saveSyncState(): Promise<void> {
    const syncState = this.syncEngine.getSyncState();
    await this.saveData({ ...this.settings, syncState });
  }

  private async loadPluginData(): Promise<PersistedPluginData> {
    const data: unknown = await this.loadData();
    return isRecord(data) ? data : {};
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return this.syncEngine?.getSyncState() ?? this.syncState;
  }

  private maybeShowWhatsNewModal(): void {
    const currentVersion = this.manifest.version;
    const lastShown = this.settings.lastReleaseNoticeVersion || '';
    if (!isVersionNewer(currentVersion, lastShown)) return;

    window.setTimeout(() => {
      this.showWhatsNewModal(currentVersion, true);
    }, 1500);
  }

  private showWhatsNewModal(currentVersion: string, markDismissed: boolean): void {
    const currentEntry = entryForVersion(currentVersion);
    if (!currentEntry) {
      this.settings.lastReleaseNoticeVersion = currentVersion;
      void this.saveSettings();
      return;
    }

    new WhatsNewModal(
      this.app,
      this.settings.uiLanguage,
      currentEntry,
      RECENT_UPDATE_HIGHLIGHTS,
      async () => {
        if (markDismissed) {
          this.settings.lastReleaseNoticeVersion = currentVersion;
          await this.saveSettings();
        }
      }
    ).open();
  }

  openWhatsNewModalFromSettings(): void {
    this.showWhatsNewModal(this.manifest.version, false);
  }

  /**
   * Perform a sync operation
   */
  async syncNow(): Promise<SyncResult> {
    this.updateStatusBar('Syncing...');
    
    try {
      const result = await this.syncEngine.performSync();
      await this.saveSyncState();
      this.updateStatusBar();
      return result;
    } catch (error) {
      this.updateStatusBar('Sync failed');
      throw error;
    }
  }

  async syncDailyNoteNow(): Promise<DailyNoteSyncResult> {
    const result = await this.syncEngine.syncDailyNoteNow();
    await this.saveSyncState();
    this.updateStatusBar();
    return result;
  }

  private async runSyncWithNotice(mode: 'manual' | 'automatic'): Promise<void> {
    const progressNotice = mode === 'manual' && this.settings.notifications.manualSync
      ? createPersistentSyncNotice('Syncing...')
      : null;
    this.updateStatusBar('Syncing...');

    try {
      const result = await this.syncNow();
      const shouldNotify = mode === 'manual'
        ? this.settings.notifications.manualSync
        : shouldShowAutomaticSyncNotice(result, this.settings.notifications);

      if (shouldNotify) {
        const message = formatSyncResult(result);
        if (progressNotice) {
          setSyncNoticeMessage(progressNotice, message);
          window.setTimeout(() => progressNotice.hide(), noticeDurationForResult(result));
        } else {
          showSyncTodoistNotice(message, noticeDurationForResult(result));
        }
      } else if (progressNotice) {
        progressNotice.hide();
      }
    } catch (error) {
      const message = `Sync failed: ${error}`;
      if (progressNotice) {
        setSyncNoticeMessage(progressNotice, message);
        window.setTimeout(() => progressNotice.hide(), 10000);
      } else {
        showSyncTodoistNotice(message, 10000);
      }
      throw error;
    }
  }

  /**
   * Start the automatic sync interval
   */
  private startSyncInterval(): void {
    if (this.settings.syncIntervalMinutes <= 0) {
      return;
    }

    const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
    
    this.syncIntervalId = window.setInterval(() => {
      if (!this.settings.apiToken) {
        return;
      }

      console.debug('Running scheduled sync...');
      void this.runSyncWithNotice('automatic').catch((error: unknown) => {
        console.error('Scheduled sync failed:', error);
      });
    }, intervalMs);

    // Register interval for cleanup
    this.registerInterval(this.syncIntervalId);
  }

  /**
   * Restart the sync interval (after settings change)
   */
  restartSyncInterval(): void {
    // Stop existing interval
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    // Start new interval
    this.startSyncInterval();
  }

  /**
   * Update the status bar text
   */
  private updateStatusBar(text?: string): void {
    if (!this.statusBarItem) return;

    if (text) {
      this.statusBarItem.setText(`Todoist: ${text}`);
    } else {
      const taskCount = Object.keys(this.getSyncState().tasks).length;
      this.statusBarItem.setText(`Todoist: ${taskCount} tasks`);
    }
  }
}
