import { App, PluginSettingTab, Setting } from 'obsidian';
import TodoistSyncPlugin from './main';
import { ConflictResolution, TodoistLabel, TodoistPriority, TodoistProject } from './types';
import {
  formatSyncResult,
  noticeDurationForResult,
  showSyncTodoistNotice,
} from './notices';

type SettingsTabId = 'general' | 'daily';
const SETTINGS_TABS: SettingsTabId[] = ['general', 'daily'];
const ACTIVE_TAB_STORAGE_KEY = 'sync-todoist:active-settings-tab';

const PRIORITY_OPTIONS: Array<{ value: TodoistPriority; label: string }> = [
  { value: TodoistPriority.HIGH, label: 'Urgent (p1)' },
  { value: TodoistPriority.MEDIUM, label: 'High (p2)' },
  { value: TodoistPriority.LOW, label: 'Medium (p3)' },
  { value: TodoistPriority.NONE, label: 'Normal (p4)' },
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
    // API Token Setting
    new Setting(containerEl)
      .setName('Todoist API token')
      .setDesc('Your todoist API token. Find it in todoist settings → integrations → developer.')
      .addText((text) => {
        text
          .setPlaceholder('Enter your API token')
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
          .setButtonText('Verify')
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('Verifying...');
            
            try {
              this.plugin.todoistService.initialize(this.plugin.settings.apiToken);
              const isValid = await this.plugin.todoistService.verifyToken();
              
              if (isValid) {
                showSyncTodoistNotice('API token is valid.');
                // Load projects after successful verification
                await this.loadTodoistMetadata();
                this.display(); // Refresh to show projects
              } else {
                showSyncTodoistNotice('API token is invalid. Please check and try again.', 10000);
              }
            } catch (error) {
              showSyncTodoistNotice('Failed to verify token. Please check your internet connection.', 10000);
              console.warn('Token verification error:', error);
            } finally {
              button.setDisabled(false);
              button.setButtonText('Verify');
            }
          });
      });

    // Sync Tag Setting
    new Setting(containerEl)
      .setName('Sync tag')
      .setDesc('Tag used to identify tasks for syncing. Include the # symbol.')
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
      .setName('Default project')
      .setDesc('Default todoist project for new tasks. Leave empty to use inbox.');

    if (this.projects.length > 0) {
      projectSetting.addDropdown((dropdown) => {
        // Add empty option for Inbox
        dropdown.addOption('', 'Inbox (default)');
        
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
          .setPlaceholder('Verify API token to load projects')
          .setValue(this.plugin.settings.defaultProjectId)
          .setDisabled(true);
      });
    }

    // Sync Interval Setting
    new Setting(containerEl)
      .setName('Sync interval')
      .setDesc('How often to sync with todoist (in minutes). Set to 0 to disable auto sync.')
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
      .setName('Conflict resolution')
      .setDesc('How to handle conflicts when both sides have changes.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('todoist-wins', 'Todoist wins')
          .addOption('obsidian-wins', 'Local wins')
          .addOption('ask-user', 'Ask me each time')
          .setValue(this.plugin.settings.conflictResolution)
          .onChange(async (value) => {
            this.plugin.settings.conflictResolution = value as ConflictResolution;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName('Notifications').setHeading();

    new Setting(containerEl)
      .setName('Manual sync notices')
      .setDesc('Show a short completion notice after manual sync actions.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifications.manualSync)
          .onChange(async (value) => {
            this.plugin.settings.notifications.manualSync = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Automatic sync notices')
      .setDesc('Show scheduled sync notices on desktop. Errors are always shown.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifications.automaticSync)
          .onChange(async (value) => {
            this.plugin.settings.notifications.automaticSync = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Mobile automatic sync notices')
      .setDesc('Show scheduled sync notices on mobile. Errors are always shown.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.notifications.mobileAutomaticSync)
          .onChange(async (value) => {
            this.plugin.settings.notifications.mobileAutomaticSync = value;
            await this.plugin.saveSettings();
          })
      );

    // Manual Sync Section
    new Setting(containerEl).setName('Manual actions').setHeading();

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc('Manually trigger a sync.')
      .addButton((button) => {
        button
          .setButtonText('Sync now')
          .setCta()
          .onClick(async () => {
            if (!this.plugin.settings.apiToken) {
              showSyncTodoistNotice('Please configure your API token first.');
              return;
            }

            button.setDisabled(true);
            button.setButtonText('Syncing...');

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
              showSyncTodoistNotice('Sync failed. Check console for details.', 10000);
              console.warn('Sync error:', error);
            } finally {
              button.setDisabled(false);
              button.setButtonText('Sync now');
            }
          });
      });

    // Status Section
    new Setting(containerEl).setName('Status').setHeading();

    const statusEl = containerEl.createDiv({ cls: 'todoist-sync-status' });
    this.updateStatusDisplay(statusEl);
  }

  private renderTabBar(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: 'sync-todoist-tab-bar' });
    for (const tabId of SETTINGS_TABS) {
      const button = bar.createEl('button', {
        cls: 'sync-todoist-tab' + (tabId === this.activeTab ? ' is-active' : ''),
        text: tabId === 'general' ? 'General' : '每日 Daily Note',
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
      .setName('每日 daily note')
      .setDesc('Write today\'s matching tasks into the managed marker region of today\'s daily note.')
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
      .setName('Marker start')
      .setDesc('Start marker for the managed daily note source-mode region.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.dailyNote.markerStart)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.markerStart = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Marker end')
      .setDesc('End marker for the managed daily note source-mode region.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.dailyNote.markerEnd)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.markerEnd = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Sync daily note now')
      .setDesc('Refresh today\'s daily note using the current filter settings.')
      .addButton((button) =>
        button
          .setButtonText('Sync today')
          .onClick(async () => {
            const result = await this.plugin.syncDailyNoteNow();
            showSyncTodoistNotice(result.message ?? `Daily note result: ${result.status}`);
          })
      );

    new Setting(containerEl).setName('Task filters').setHeading();
    new Setting(containerEl).setDesc('Each dimension defaults to all. If you select values in multiple dimensions, a task must match every selected dimension.');

    if (this.plugin.settings.apiToken && (!this.projectsLoaded || !this.labelsLoaded)) {
      void this.loadTodoistMetadata().then(() => this.display());
    }

    if (!this.plugin.settings.apiToken || (!this.projectsLoaded && !this.labelsLoaded)) {
      new Setting(containerEl).setDesc('Verify your todoist API token in general settings first to load projects and labels.');
    }

    this.renderProjectSelector(containerEl);
    this.renderLabelSelector(containerEl);
    this.renderPrioritySelector(containerEl);
  }

  private renderProjectSelector(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Projects').setHeading();
    const wrapper = containerEl.createDiv({ cls: 'sync-todoist-multi-select' });
    this.renderAllCheckbox(wrapper, 'All projects', this.plugin.settings.dailyNote.projectIds.length === 0, async () => {
      this.plugin.settings.dailyNote.projectIds = [];
      await this.plugin.saveSettings();
      this.display();
    });

    for (const project of this.projects) {
      this.renderCheckbox(
        wrapper,
        project.name + (project.isInbox ? ' (Inbox)' : ''),
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
    new Setting(containerEl).setName('Labels').setHeading();
    const wrapper = containerEl.createDiv({ cls: 'sync-todoist-multi-select' });
    this.renderAllCheckbox(wrapper, 'All labels', this.plugin.settings.dailyNote.labels.length === 0, async () => {
      this.plugin.settings.dailyNote.labels = [];
      await this.plugin.saveSettings();
      this.display();
    });

    for (const label of this.labels) {
      this.renderCheckbox(
        wrapper,
        label.name + (label.isShared ? ' (shared)' : ''),
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
    new Setting(containerEl).setName('Priority').setHeading();
    const wrapper = containerEl.createDiv({ cls: 'sync-todoist-multi-select' });
    this.renderAllCheckbox(wrapper, 'All priorities', this.plugin.settings.dailyNote.priorities.length === 0, async () => {
      this.plugin.settings.dailyNote.priorities = [];
      await this.plugin.saveSettings();
      this.display();
    });

    for (const priority of PRIORITY_OPTIONS) {
      this.renderCheckbox(
        wrapper,
        priority.label,
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
    statusText.textContent = `Synced tasks: ${taskCount}`;

    if (syncState.lastFullSync > 0) {
      const lastSync = new Date(syncState.lastFullSync);
      const lastSyncText = containerEl.createEl('p');
      lastSyncText.textContent = `Last sync: ${lastSync.toLocaleString()}`;
    } else {
      const lastSyncText = containerEl.createEl('p');
      lastSyncText.textContent = 'Last sync: never';
    }

    const apiStatus = containerEl.createEl('p');
    apiStatus.textContent = `API status: ${this.plugin.todoistService.isInitialized() ? 'Connected' : 'Not connected'}`;
  }
}

function updateSelection<T>(values: T[], value: T, checked: boolean): T[] {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter(item => item !== value);
}
