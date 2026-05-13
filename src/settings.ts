import { App, PluginSettingTab, Setting } from 'obsidian';
import TodoistSyncPlugin from './main';
import { ConflictResolution, DailyNoteSortMode, TodoistLabel, TodoistPriority, TodoistProject, UiLanguage } from './types';
import { I18nKey, t } from './i18n';
import {
  formatSyncResult,
  noticeDurationForResult,
  showSyncTodoistNotice,
} from './notices';

type SettingsTabId = 'general' | 'daily';
const SETTINGS_TABS: SettingsTabId[] = ['general', 'daily'];
const ACTIVE_TAB_STORAGE_KEY = 'sync-todoist:active-settings-tab';

const PRIORITY_OPTIONS: Array<{ value: TodoistPriority; labelKey: I18nKey }> = [
  { value: TodoistPriority.HIGH, labelKey: 'priority.urgent' },
  { value: TodoistPriority.MEDIUM, labelKey: 'priority.high' },
  { value: TodoistPriority.LOW, labelKey: 'priority.medium' },
  { value: TodoistPriority.NONE, labelKey: 'priority.normal' },
];

/**
 * Settings tab for Todoist Sync plugin
 */
export class TodoistSyncSettingTab extends PluginSettingTab {
  plugin: TodoistSyncPlugin;
  private projects: TodoistProject[] = [];
  private labels: TodoistLabel[] = [];
  private projectsLoaded = false;
  private labelsLoaded = false;
  private activeTab: SettingsTabId = 'general';

  constructor(app: App, plugin: TodoistSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private tr(key: I18nKey, values?: Record<string, string | number>): string {
    return t(this.plugin.settings.uiLanguage, key, values);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.activeTab = this.loadActiveTab();
    this.renderTabBar(containerEl);

    if (this.activeTab === 'daily') {
      this.renderDailyNoteSettings(containerEl);
      return;
    }

    this.renderGeneralSettings(containerEl);
  }

  private renderGeneralSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(this.tr('general.language.name'))
      .setDesc(this.tr('general.language.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('en', this.tr('general.language.en'))
          .addOption('zh-CN', this.tr('general.language.zh'))
          .setValue(this.plugin.settings.uiLanguage)
          .onChange(async (value) => {
            this.plugin.settings.uiLanguage = value as UiLanguage;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // API Token Setting
    new Setting(containerEl)
      .setName(this.tr('general.apiToken.name'))
      .setDesc(this.tr('general.apiToken.desc'))
      .addText((text) => {
        text
          .setPlaceholder(this.tr('general.apiToken.placeholder'))
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value;
            await this.plugin.saveSettings();
            // Reset projects when token changes
            this.projectsLoaded = false;
            this.labelsLoaded = false;
            this.projects = [];
            this.labels = [];
          });
        // Make it look like a password field
        text.inputEl.type = 'password';
        text.inputEl.addClass('syncist-api-token-input');
      })
      .addButton((button) => {
        button
          .setButtonText(this.tr('general.apiToken.verify'))
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText(this.tr('general.apiToken.verifying'));
            
            try {
              this.plugin.todoistService.initialize(this.plugin.settings.apiToken);
              const isValid = await this.plugin.todoistService.verifyToken();
              
              if (isValid) {
                showSyncTodoistNotice(this.tr('general.apiToken.valid'));
                // Load projects after successful verification
                await this.loadTodoistMetadata();
                this.display(); // Refresh to show projects
              } else {
                showSyncTodoistNotice(this.tr('general.apiToken.invalid'), 10000);
              }
            } catch (error) {
              showSyncTodoistNotice(this.tr('general.apiToken.failed'), 10000);
              console.warn('Token verification error:', error);
            } finally {
              button.setDisabled(false);
              button.setButtonText(this.tr('general.apiToken.verify'));
            }
          });
      });

    // Sync Tag Setting
    new Setting(containerEl)
      .setName(this.tr('general.syncTag.name'))
      .setDesc(this.tr('general.syncTag.desc'))
      .addText((text) =>
        text
          .setPlaceholder('#todoist')
          .setValue(this.plugin.settings.syncTag)
          .onChange(async (value) => {
            // Ensure tag starts with #
            if (value && !value.startsWith('#')) {
              value = '#' + value;
            }
            this.plugin.settings.syncTag = value || '#todoist';
            await this.plugin.saveSettings();
          })
      );

    // Load projects if token is set
    if (this.plugin.settings.apiToken && !this.projectsLoaded) {
      void this.loadTodoistMetadata().then(() => this.display());
    }

    // Default Project Setting
    const projectSetting = new Setting(containerEl)
      .setName(this.tr('general.defaultProject.name'))
      .setDesc(this.tr('general.defaultProject.desc'));

    if (this.projects.length > 0) {
      projectSetting.addDropdown((dropdown) => {
        // Add empty option for Inbox
        dropdown.addOption('', this.tr('general.defaultProject.inbox'));
        
        for (const project of this.projects) {
          dropdown.addOption(project.id, project.name);
        }
        
        dropdown.setValue(this.plugin.settings.defaultProjectId);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultProjectId = value;
          await this.plugin.saveSettings();
        });
      });
    } else {
      projectSetting.addText((text) => {
        text
          .setPlaceholder(this.tr('general.defaultProject.placeholder'))
          .setValue(this.plugin.settings.defaultProjectId)
          .setDisabled(true);
      });
    }

    // Sync Interval Setting
    new Setting(containerEl)
      .setName(this.tr('general.syncInterval.name'))
      .setDesc(this.tr('general.syncInterval.desc'))
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(String(this.plugin.settings.syncIntervalMinutes))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.syncIntervalMinutes = num;
              await this.plugin.saveSettings();
              this.plugin.restartSyncInterval();
            }
          })
      );

    // Conflict Resolution Setting
    new Setting(containerEl)
      .setName(this.tr('general.conflict.name'))
      .setDesc(this.tr('general.conflict.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('todoist-wins', this.tr('general.conflict.todoist'))
          .addOption('obsidian-wins', this.tr('general.conflict.local'))
          .addOption('ask-user', this.tr('general.conflict.ask'))
          .setValue(this.plugin.settings.conflictResolution)
          .onChange(async (value) => {
            this.plugin.settings.conflictResolution = value as ConflictResolution;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName(this.tr('general.notifications')).setHeading();

    new Setting(containerEl)
      .setName(this.tr('general.notifications.manual.name'))
      .setDesc(this.tr('general.notifications.manual.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifications.manualSync)
          .onChange(async (value) => {
            this.plugin.settings.notifications.manualSync = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.tr('general.notifications.auto.name'))
      .setDesc(this.tr('general.notifications.auto.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifications.automaticSync)
          .onChange(async (value) => {
            this.plugin.settings.notifications.automaticSync = value;
            await this.plugin.saveSettings();
          })
      );

    // Manual Sync Section
    new Setting(containerEl).setName(this.tr('general.manualActions')).setHeading();

    new Setting(containerEl)
      .setName(this.tr('general.syncNow.name'))
      .setDesc(this.tr('general.syncNow.desc'))
      .addButton((button) => {
        button
          .setButtonText(this.tr('general.syncNow.button'))
          .setCta()
          .onClick(async () => {
            if (!this.plugin.settings.apiToken) {
              showSyncTodoistNotice(this.tr('general.syncNow.noToken'));
              return;
            }

            button.setDisabled(true);
            button.setButtonText(this.tr('general.syncNow.syncing'));

            try {
              const result = await this.plugin.syncNow();
              if (this.plugin.settings.notifications.manualSync) {
                showSyncTodoistNotice(formatSyncResult(result), noticeDurationForResult(result));
              }
              
              if (result.errors.length > 0) {
                console.warn('Sync errors:', result.errors);
              }
              
              // Refresh the display to show updated status
              this.display();
            } catch (error) {
              showSyncTodoistNotice(this.tr('general.syncNow.failed'), 10000);
              console.warn('Sync error:', error);
            } finally {
              button.setDisabled(false);
              button.setButtonText(this.tr('general.syncNow.button'));
            }
          });
      });

    // Status Section
    new Setting(containerEl).setName(this.tr('general.status')).setHeading();

    const statusEl = containerEl.createDiv({ cls: 'todoist-sync-status' });
    this.updateStatusDisplay(statusEl);
  }

  private renderTabBar(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: 'sync-todoist-tab-bar' });
    for (const tabId of SETTINGS_TABS) {
      const button = bar.createEl('button', {
        cls: 'sync-todoist-tab' + (tabId === this.activeTab ? ' is-active' : ''),
        text: tabId === 'general' ? this.tr('tab.general') : this.tr('tab.daily'),
      });
      button.onclick = () => {
        this.activeTab = tabId;
        this.plugin.app.saveLocalStorage(ACTIVE_TAB_STORAGE_KEY, tabId);
        this.display();
      };
    }
  }

  private loadActiveTab(): SettingsTabId {
    const raw: unknown = this.plugin.app.loadLocalStorage(ACTIVE_TAB_STORAGE_KEY);
    if (typeof raw === 'string' && (SETTINGS_TABS as string[]).includes(raw)) {
      return raw as SettingsTabId;
    }
    return 'general';
  }

  private renderDailyNoteSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(this.tr('daily.enable.name'))
      .setDesc(this.tr('daily.enable.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.dailyNote.enabled)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.enabled = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (!this.plugin.settings.dailyNote.enabled) {
      return;
    }

    new Setting(containerEl)
      .setName(this.tr('daily.markerStart.name'))
      .setDesc(this.tr('daily.markerStart.desc'))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.dailyNote.markerStart)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.markerStart = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.tr('daily.markerEnd.name'))
      .setDesc(this.tr('daily.markerEnd.desc'))
      .addText((text) =>
        text
          .setValue(this.plugin.settings.dailyNote.markerEnd)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.markerEnd = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setDesc(this.tr('daily.warning'));

    new Setting(containerEl)
      .setName(this.tr('daily.sort.name'))
      .setDesc(this.tr('daily.sort.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('time', this.tr('daily.sort.time'))
          .addOption('priority', this.tr('daily.sort.priority'))
          .setValue(this.plugin.settings.dailyNote.sortMode)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.sortMode = value as DailyNoteSortMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(this.tr('daily.includeCompleted.name'))
      .setDesc(this.tr('daily.includeCompleted.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.dailyNote.includeCompleted)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.includeCompleted = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.tr('daily.syncNow.name'))
      .setDesc(this.tr('daily.syncNow.desc'))
      .addButton((button) =>
        button
          .setButtonText(this.tr('daily.syncNow.button'))
          .onClick(async () => {
            const result = await this.plugin.syncDailyNoteNow();
            showSyncTodoistNotice(result.message ?? this.tr('daily.syncNow.result', { status: result.status }));
          })
      );

    new Setting(containerEl).setName(this.tr('daily.filters')).setHeading();
    new Setting(containerEl).setDesc(this.tr('daily.filters.desc'));

    if (this.plugin.settings.apiToken && (!this.projectsLoaded || !this.labelsLoaded)) {
      void this.loadTodoistMetadata().then(() => this.display());
    }

    if (!this.plugin.settings.apiToken || (!this.projectsLoaded && !this.labelsLoaded)) {
      new Setting(containerEl).setDesc(this.tr('daily.filters.verifyFirst'));
    }

    this.renderProjectSelector(containerEl);
    this.renderLabelSelector(containerEl);
    this.renderPrioritySelector(containerEl);
  }

  private renderProjectSelector(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(this.tr('daily.projects')).setHeading();
    const wrapper = containerEl.createDiv({ cls: 'sync-todoist-multi-select' });
    this.renderAllCheckbox(wrapper, this.tr('daily.projects.all'), this.plugin.settings.dailyNote.projectIds.length === 0, async () => {
      this.plugin.settings.dailyNote.projectIds = [];
      await this.plugin.saveSettings();
      this.display();
    });

    for (const project of this.projects) {
      this.renderCheckbox(
        wrapper,
        project.name + (project.isInbox ? ` (${this.tr('daily.projects.inbox')})` : ''),
        this.plugin.settings.dailyNote.projectIds.includes(project.id),
        async (checked) => {
          this.plugin.settings.dailyNote.projectIds = updateSelection(
            this.plugin.settings.dailyNote.projectIds,
            project.id,
            checked
          );
          await this.plugin.saveSettings();
          this.display();
        }
      );
    }
  }

  private renderLabelSelector(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(this.tr('daily.labels')).setHeading();
    const wrapper = containerEl.createDiv({ cls: 'sync-todoist-multi-select' });
    this.renderAllCheckbox(wrapper, this.tr('daily.labels.all'), this.plugin.settings.dailyNote.labels.length === 0, async () => {
      this.plugin.settings.dailyNote.labels = [];
      await this.plugin.saveSettings();
      this.display();
    });

    for (const label of this.labels) {
      this.renderCheckbox(
        wrapper,
        label.name + (label.isShared ? ` (${this.tr('daily.labels.shared')})` : ''),
        this.plugin.settings.dailyNote.labels.includes(label.name),
        async (checked) => {
          this.plugin.settings.dailyNote.labels = updateSelection(
            this.plugin.settings.dailyNote.labels,
            label.name,
            checked
          );
          await this.plugin.saveSettings();
          this.display();
        }
      );
    }
  }

  private renderPrioritySelector(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(this.tr('daily.priority')).setHeading();
    const wrapper = containerEl.createDiv({ cls: 'sync-todoist-multi-select' });
    this.renderAllCheckbox(wrapper, this.tr('daily.priority.all'), this.plugin.settings.dailyNote.priorities.length === 0, async () => {
      this.plugin.settings.dailyNote.priorities = [];
      await this.plugin.saveSettings();
      this.display();
    });

    for (const priority of PRIORITY_OPTIONS) {
      this.renderCheckbox(
        wrapper,
        this.tr(priority.labelKey),
        this.plugin.settings.dailyNote.priorities.includes(priority.value),
        async (checked) => {
          this.plugin.settings.dailyNote.priorities = updateSelection(
            this.plugin.settings.dailyNote.priorities,
            priority.value,
            checked
          );
          await this.plugin.saveSettings();
          this.display();
        }
      );
    }
  }

  private renderAllCheckbox(parent: HTMLElement, label: string, checked: boolean, onCheck: () => Promise<void>): void {
    this.renderCheckbox(parent, label, checked, async (value) => {
      if (value) await onCheck();
    });
  }

  private renderCheckbox(parent: HTMLElement, label: string, checked: boolean, onChange: (checked: boolean) => Promise<void>): void {
    const row = parent.createEl('label', { cls: 'sync-todoist-checkbox-row' });
    const input = row.createEl('input', { type: 'checkbox' });
    input.checked = checked;
    input.onchange = () => {
      void onChange(input.checked);
    };
    row.createSpan({ text: label });
  }

  /**
   * Load projects from Todoist
   */
  private async loadProjects(): Promise<void> {
    if (!this.plugin.settings.apiToken) {
      return;
    }

    try {
      this.plugin.todoistService.initialize(this.plugin.settings.apiToken);
      this.projects = await this.plugin.todoistService.getProjects();
      this.projectsLoaded = true;
    } catch (error) {
      console.warn('Failed to load projects:', error);
      this.projects = [];
    }
  }

  private async loadTodoistMetadata(): Promise<void> {
    await this.loadProjects();
    await this.loadLabels();
  }

  private async loadLabels(): Promise<void> {
    if (!this.plugin.settings.apiToken) {
      return;
    }

    try {
      this.plugin.todoistService.initialize(this.plugin.settings.apiToken);
      this.labels = await this.plugin.todoistService.getLabels();
      this.labelsLoaded = true;
    } catch (error) {
      console.warn('Failed to load labels:', error);
      this.labels = [];
    }
  }

  /**
   * Update the status display
   */
  private updateStatusDisplay(containerEl: HTMLElement): void {
    containerEl.empty();

    const syncState = this.plugin.getSyncState();
    const taskCount = Object.keys(syncState.tasks).length;

    const statusText = containerEl.createEl('p');
    statusText.textContent = this.tr('general.status.synced', { count: taskCount });

    if (syncState.lastFullSync > 0) {
      const lastSync = new Date(syncState.lastFullSync);
      const lastSyncText = containerEl.createEl('p');
      lastSyncText.textContent = this.tr('general.status.last', { time: lastSync.toLocaleString() });
    } else {
      const lastSyncText = containerEl.createEl('p');
      lastSyncText.textContent = this.tr('general.status.never');
    }

    const apiStatus = containerEl.createEl('p');
    apiStatus.textContent = this.tr('general.status.api', {
      status: this.plugin.todoistService.isInitialized()
        ? this.tr('general.status.connected')
        : this.tr('general.status.disconnected'),
    });
  }
}

function updateSelection<T>(values: T[], value: T, checked: boolean): T[] {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter(item => item !== value);
}
