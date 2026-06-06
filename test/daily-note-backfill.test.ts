import assert from 'node:assert/strict';
import { TFile } from 'obsidian';
import {
  enumerateDailyNoteBackfillDates,
} from '../src/daily-note-backfill';
import { localTodayISODate } from '../src/daily-note';
import { SyncEngine } from '../src/sync-engine';
import { DEFAULT_SETTINGS, DEFAULT_SYNC_STATE, TodoistPriority, TodoistTask } from '../src/types';
import { TodoistService } from '../src/todoist-service';

const START = '%% sync-todoist:daily:start %%';
const END = '%% sync-todoist:daily:end %%';

const testGlobal = globalThis as typeof globalThis & { window?: { setTimeout: typeof setTimeout } };
testGlobal.window ??= { setTimeout };

function task(overrides: Partial<TodoistTask>): TodoistTask {
  return {
    id: 'task',
    content: 'Task',
    description: '',
    projectId: 'work',
    parentId: null,
    priority: TodoistPriority.NONE,
    due: { date: '2026-05-10' },
    labels: [],
    isCompleted: false,
    createdAt: '',
    completedAt: null,
    url: 'https://todoist.com/app/task/task',
    ...overrides,
  };
}

class FakeVault {
  files = new Map<string, { file: TFile; content: string }>();
  folders = new Set<string>();

  addFile(path: string, content: string): TFile {
    const file = new TFile(path);
    this.files.set(path, { file, content });
    const folder = path.split('/').slice(0, -1).join('/');
    if (folder) this.folders.add(folder);
    return file;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.values()].map(entry => entry.file);
  }

  getAbstractFileByPath(path: string): TFile | { path: string } | null {
    return this.files.get(path)?.file ?? (this.folders.has(path) ? { path } : null);
  }

  async read(file: TFile): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error(`Missing file ${file.path}`);
    return entry.content;
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  async modify(file: TFile, content: string): Promise<void> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error(`Missing file ${file.path}`);
    entry.content = content;
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.files.has(path)) throw new Error(`File exists ${path}`);
    return this.addFile(path, content);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }
}

class FakeTodoistService {
  mutations = 0;

  constructor(
    private activeTasks: TodoistTask[],
    private completedTasks: TodoistTask[] = [],
  ) {}

  isInitialized(): boolean {
    return true;
  }

  async ensureProjectCache(): Promise<void> {}

  async getTasks(): Promise<TodoistTask[]> {
    return this.activeTasks;
  }

  async getCompletedTasks(): Promise<TodoistTask[]> {
    return this.completedTasks;
  }

  async getCompletedTaskActivities(): Promise<[]> {
    return [];
  }

  getProjectName(projectId: string): string | undefined {
    return projectId === 'work' ? 'Work' : undefined;
  }

  isInboxProject(): boolean {
    return false;
  }

  async createTask(): Promise<TodoistTask> {
    this.mutations++;
    throw new Error('Backfill must not create Todoist tasks');
  }

  async updateTask(): Promise<TodoistTask> {
    this.mutations++;
    throw new Error('Backfill must not update Todoist tasks');
  }

  async completeTask(): Promise<boolean> {
    this.mutations++;
    throw new Error('Backfill must not complete Todoist tasks');
  }
}

const dateList = enumerateDailyNoteBackfillDates('2026-05-10', '2026-05-12', '2026-05-12');
assert.deepEqual(dateList.dates, ['2026-05-10', '2026-05-11']);
assert.equal(dateList.scannedDates, 3);
assert.equal(dateList.skippedNonPastDates, 1);
assert.equal(enumerateDailyNoteBackfillDates('2026-05-12', '2026-05-10', '2026-05-20').error, 'Backfill start date must be on or before end date.');
assert.equal(enumerateDailyNoteBackfillDates('2026-02-30', '2026-03-01', '2026-03-10').error, 'Backfill dates must use YYYY-MM-DD.');
assert.deepEqual(enumerateDailyNoteBackfillDates('2024-02-29', '2024-02-29', '2024-03-01').dates, ['2024-02-29']);

async function runEngineBackfillTests(): Promise<void> {
  const vault = new FakeVault();
  vault.addFile('Daily/2026-05-10.md', '# 2026-05-10\n');
  vault.addFile('Daily/2026-05-11.md', `# 2026-05-11\n${START}\nold`);

  const app = {
    vault,
    internalPlugins: {
      plugins: {
        'daily-notes': {
          enabled: true,
          instance: { options: { folder: 'Daily', format: 'YYYY-MM-DD' } },
        },
      },
    },
  };
  const service = new FakeTodoistService(
    [
      task({ id: 'active-10', content: 'Active May 10', due: { date: '2026-05-10' } }),
      task({ id: 'active-12', content: 'Active May 12', due: { date: '2026-05-12' } }),
    ],
    [
      task({
        id: 'completed-10',
        content: 'Completed May 10',
        due: { date: '2026-05-01' },
        isCompleted: true,
        completedAt: '2026-05-10T16:00:00Z',
      }),
    ]
  );
  const syncState = { ...DEFAULT_SYNC_STATE, tasks: {} };
  const engine = new SyncEngine(
    app as never,
    service as unknown as TodoistService,
    {
      ...DEFAULT_SETTINGS,
      dailyNote: {
        ...DEFAULT_SETTINGS.dailyNote,
        enabled: true,
        completedTaskMode: 'completed-today',
      },
    },
    syncState
  );

  const preview = await engine.previewDailyNoteBackfill({
    startDate: '2026-05-10',
    endDate: '2026-05-12',
    createMissing: false,
  });
  assert.equal(preview.changedFiles, 1);
  assert.equal(preview.invalidMarkerFiles, 1);
  assert.equal(preview.missingFiles, 1);
  assert.equal(preview.taskRows, 3);
  assert.equal(vault.files.get('Daily/2026-05-10.md')?.content, '# 2026-05-10\n');

  const applied = await engine.applyDailyNoteBackfill({
    startDate: '2026-05-10',
    endDate: '2026-05-12',
    createMissing: false,
  });
  assert.equal(applied.changedFiles, 1);
  assert.equal(applied.createdFiles, 0);
  assert.equal(service.mutations, 0);
  const updated = vault.files.get('Daily/2026-05-10.md')?.content ?? '';
  assert.match(updated, /Active May 10/);
  assert.match(updated, /Completed May 10/);
  assert.doesNotMatch(vault.files.get('Daily/2026-05-11.md')?.content ?? '', new RegExp(END));
  assert.equal(vault.files.has('Daily/2026-05-12.md'), false);

  const created = await engine.applyDailyNoteBackfill({
    startDate: '2026-05-12',
    endDate: '2026-05-12',
    createMissing: true,
  });
  assert.equal(created.createdFiles, 1);
  assert.match(vault.files.get('Daily/2026-05-12.md')?.content ?? '', /Active May 12/);
  assert.equal(service.mutations, 0);
}

await runEngineBackfillTests();

async function runFullSyncDailyNoteDateRegression(): Promise<void> {
  const today = localTodayISODate();
  const vault = new FakeVault();
  vault.addFile(`Daily/${today}.md`, `# ${today}\n${START}\n${END}\n`);
  const app = {
    vault,
    internalPlugins: {
      plugins: {
        'daily-notes': {
          enabled: true,
          instance: { options: { folder: 'Daily', format: 'YYYY-MM-DD' } },
        },
      },
    },
  };
  const service = new FakeTodoistService([
    task({ id: 'today-active', content: 'Today Active', due: { date: today } }),
  ]);
  const engine = new SyncEngine(
    app as never,
    service as unknown as TodoistService,
    {
      ...DEFAULT_SETTINGS,
      dailyNote: {
        ...DEFAULT_SETTINGS.dailyNote,
        enabled: true,
      },
    },
    { ...DEFAULT_SYNC_STATE, tasks: {} }
  );

  const result = await engine.performSync();
  assert.equal(result.dailyNote?.status, 'updated');
  assert.match(vault.files.get(`Daily/${today}.md`)?.content ?? '', /Today Active/);
}

await runFullSyncDailyNoteDateRegression();
console.log('daily-note backfill tests passed');
