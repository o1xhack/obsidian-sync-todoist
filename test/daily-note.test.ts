import assert from 'node:assert/strict';
import {
  buildCompletedRecurringTaskSnapshots,
  buildRecentlyCompletedRecurringTaskSnapshot,
  extractTodoistIdsFromMarkerRegion,
  filterDailyNoteTasks,
  isMarkerRegionValid,
  renderDailyNoteTaskBlock,
  sortDailyNoteTasks,
  updateDailyNoteContent,
} from '../src/daily-note';
import { DEFAULT_SETTINGS, TodoistPriority, TodoistTask } from '../src/types';

const START = '%% sync-todoist:daily:start %%';
const END = '%% sync-todoist:daily:end %%';

function task(overrides: Partial<TodoistTask>): TodoistTask {
  return {
    id: '1',
    content: 'Write release notes',
    description: '',
    projectId: 'inbox',
    parentId: null,
    priority: TodoistPriority.NONE,
    due: { date: '2026-05-13' },
    labels: [],
    isCompleted: false,
    createdAt: '',
    completedAt: null,
    url: 'https://todoist.com/app/task/1',
    ...overrides,
  };
}

function runDailyNoteTests(): void {
  assert.equal(isMarkerRegionValid(`${START}\nold\n${END}`, START, END), true);
  assert.equal(isMarkerRegionValid(`${END}\nold\n${START}`, START, END), false);
  assert.equal(isMarkerRegionValid(`${START}\nold`, START, END), false);
  assert.equal(isMarkerRegionValid(`${START}\nold\n${START}`, START, START), false);

  const appended = updateDailyNoteContent('# Today', START, END, `${START}\nnew\n${END}`);
  assert.equal(appended.status, 'appended');
  assert.equal(appended.content, `# Today\n\n${START}\nnew\n${END}\n`);

  const replaced = updateDailyNoteContent(
    `before\n${START}\nold\n${END}\nafter`,
    START,
    END,
    `${START}\nnew\n${END}`
  );
  assert.equal(replaced.status, 'replaced');
  assert.equal(replaced.content, `before\n${START}\nnew\n${END}\nafter`);

  const invalid = updateDailyNoteContent(`before\n${START}\nold`, START, END, `${START}\nnew\n${END}`);
  assert.equal(invalid.status, 'invalid_markers');
  assert.equal(invalid.content, `before\n${START}\nold`);

  assert.deepEqual(
    extractTodoistIdsFromMarkerRegion(
      `${START}\n- [ ] A #todoist <!-- todoist-id:abc -->\n- [ ] B #todoist <!-- todoist-id:def -->\n${END}`,
      START,
      END
    ),
    ['abc', 'def']
  );

  const settings = {
    ...DEFAULT_SETTINGS.dailyNote,
    projectIds: ['work'],
    labels: ['writing'],
    priorities: [TodoistPriority.HIGH],
  };
  const matching = task({ id: 'match', projectId: 'work', priority: TodoistPriority.HIGH, labels: ['Writing'] });
  const dueTodayWithTimeInDate = task({
    id: 'due-today-with-time-in-date',
    projectId: 'work',
    priority: TodoistPriority.HIGH,
    labels: ['writing'],
    due: { date: '2026-05-13T09:00:00' },
  });
  const dueTodayWithDatetime = task({
    id: 'due-today-with-datetime',
    projectId: 'work',
    priority: TodoistPriority.HIGH,
    labels: ['writing'],
    due: { date: '2026-05-20', datetime: '2026-05-13T16:00:00Z' },
  });
  const wrongDate = task({ id: 'wrong-date', projectId: 'work', priority: TodoistPriority.HIGH, labels: ['writing'], due: { date: '2026-05-12' } });
  const wrongProject = task({ id: 'wrong-project', projectId: 'home', priority: TodoistPriority.HIGH, labels: ['writing'] });
  const completedTodayNoDue = task({
    id: 'done-today-no-due',
    projectId: 'work',
    priority: TodoistPriority.HIGH,
    labels: ['writing'],
    due: null,
    isCompleted: true,
    completedAt: '2026-05-13T15:30:00Z',
  });
  const completedTodayWrongDue = task({
    id: 'done-today-wrong-due',
    projectId: 'work',
    priority: TodoistPriority.HIGH,
    labels: ['writing'],
    due: { date: '2026-05-01' },
    isCompleted: true,
    completedAt: '2026-05-13T09:00:00Z',
  });
  const completedYesterdayDueToday = task({
    id: 'done-yesterday-due-today',
    projectId: 'work',
    priority: TodoistPriority.HIGH,
    labels: ['writing'],
    isCompleted: true,
    completedAt: '2026-05-12T23:00:00Z',
  });
  assert.deepEqual(
    filterDailyNoteTasks(
      [
        wrongDate,
        wrongProject,
        completedTodayNoDue,
        completedTodayWrongDue,
        completedYesterdayDueToday,
        dueTodayWithTimeInDate,
        dueTodayWithDatetime,
        matching,
      ],
      settings,
      '2026-05-13'
    ).map(t => t.id),
    ['due-today-with-time-in-date', 'due-today-with-datetime', 'match']
  );

  assert.deepEqual(
    filterDailyNoteTasks(
      [
        wrongDate,
        wrongProject,
        completedTodayNoDue,
        completedTodayWrongDue,
        completedYesterdayDueToday,
        dueTodayWithTimeInDate,
        dueTodayWithDatetime,
        matching,
      ],
      { ...settings, completedTaskMode: 'due-today' },
      '2026-05-13'
    ).map(t => t.id),
    [
      'done-yesterday-due-today',
      'due-today-with-time-in-date',
      'due-today-with-datetime',
      'match',
    ]
  );

  assert.deepEqual(
    filterDailyNoteTasks(
      [
        wrongDate,
        wrongProject,
        completedTodayNoDue,
        completedTodayWrongDue,
        completedYesterdayDueToday,
        dueTodayWithTimeInDate,
        dueTodayWithDatetime,
        matching,
      ],
      { ...settings, completedTaskMode: 'completed-today' },
      '2026-05-13'
    ).map(t => t.id),
    [
      'done-today-no-due',
      'done-today-wrong-due',
      'due-today-with-time-in-date',
      'due-today-with-datetime',
      'match',
    ]
  );

  const activeRecurringToday = task({
    id: 'active-recurring-today',
    projectId: 'work',
    priority: TodoistPriority.HIGH,
    labels: ['writing'],
    due: { date: '2026-05-13', isRecurring: true },
  });
  assert.deepEqual(
    filterDailyNoteTasks([activeRecurringToday, matching], settings, '2026-05-13').map(t => t.id),
    ['active-recurring-today', 'match']
  );
  assert.deepEqual(
    filterDailyNoteTasks(
      [activeRecurringToday, matching],
      { ...settings, includeIncompleteRecurring: false },
      '2026-05-13'
    ).map(t => t.id),
    ['match']
  );

  const completedRecurringToday = task({
    id: 'done-recurring-today',
    projectId: 'work',
    priority: TodoistPriority.HIGH,
    labels: ['writing'],
    due: { date: '2026-05-13', isRecurring: true },
    isCompleted: true,
    completedAt: '2026-05-13T10:00:00Z',
  });
  assert.deepEqual(
    filterDailyNoteTasks(
      [completedRecurringToday],
      { ...settings, completedTaskMode: 'due-today', includeCompletedRecurring: false },
      '2026-05-13'
    ).map(t => t.id),
    []
  );
  assert.deepEqual(
    filterDailyNoteTasks(
      [completedRecurringToday],
      { ...settings, completedTaskMode: 'due-today', includeCompletedRecurring: true },
      '2026-05-13'
    ).map(t => t.id),
    ['done-recurring-today']
  );

  const projectNames: Record<string, string> = {
    alpha: 'Alpha',
    beta: 'Beta',
    work: 'Work',
  };
  const resolveProjectName = (projectId: string): string | null => projectNames[projectId] ?? null;

  const timeSorted = sortDailyNoteTasks(
    [
      task({ id: '10-low', content: '10 low', projectId: 'work', priority: TodoistPriority.LOW, due: { date: '2026-05-13', datetime: '2026-05-13T10:00:00' } }),
      task({ id: '09-normal', content: '09 normal', projectId: 'work', priority: TodoistPriority.NONE, due: { date: '2026-05-13', datetime: '2026-05-13T09:00:00' } }),
      task({ id: '10-urgent', content: '10 urgent', projectId: 'work', priority: TodoistPriority.HIGH, due: { date: '2026-05-13', datetime: '2026-05-13T10:00:00' } }),
      task({ id: 'no-time', content: 'No time', projectId: 'work', priority: TodoistPriority.HIGH }),
    ],
    { ...DEFAULT_SETTINGS.dailyNote, sortMode: 'time' },
    resolveProjectName
  ).map(t => t.id);
  assert.deepEqual(timeSorted, ['09-normal', '10-urgent', '10-low', 'no-time']);

  const prioritySorted = sortDailyNoteTasks(
    [
      task({ id: 'low-08', content: 'Low 08', projectId: 'work', priority: TodoistPriority.LOW, due: { date: '2026-05-13', datetime: '2026-05-13T08:00:00' } }),
      task({ id: 'urgent-11', content: 'Urgent 11', projectId: 'work', priority: TodoistPriority.HIGH, due: { date: '2026-05-13', datetime: '2026-05-13T11:00:00' } }),
      task({ id: 'urgent-09', content: 'Urgent 09', projectId: 'work', priority: TodoistPriority.HIGH, due: { date: '2026-05-13', datetime: '2026-05-13T09:00:00' } }),
    ],
    { ...DEFAULT_SETTINGS.dailyNote, sortMode: 'priority' },
    resolveProjectName
  ).map(t => t.id);
  assert.deepEqual(prioritySorted, ['urgent-09', 'urgent-11', 'low-08']);

  const fallbackSorted = sortDailyNoteTasks(
    [
      task({ id: 'beta-b', content: 'Beta B', projectId: 'beta' }),
      task({ id: 'alpha-b', content: 'Beta content', projectId: 'alpha' }),
      task({ id: 'alpha-a', content: 'Alpha content', projectId: 'alpha' }),
    ],
    { ...DEFAULT_SETTINGS.dailyNote, sortMode: 'time' },
    resolveProjectName
  ).map(t => t.id);
  assert.deepEqual(fallbackSorted, ['alpha-a', 'alpha-b', 'beta-b']);

  const block = renderDailyNoteTaskBlock(
    [matching],
    START,
    END,
    '#todoist',
    () => 'Work',
    'Daily/2026-05-13.md'
  );
  assert.equal(
    block,
    `${START}\n- [ ] Write release notes #todoist #Writing 📁 Work 🔺 📅 2026-05-13 <!-- todoist-id:match -->\n${END}`
  );

  const recurringActive = task({
    id: 'recurring',
    content: 'Weekly review',
    due: { date: '2026-05-20', isRecurring: true },
  });
  const recurringSnapshot = buildCompletedRecurringTaskSnapshots(
    [recurringActive, task({ id: 'plain', due: { date: '2026-05-20' } })],
    [
      {
        objectId: 'recurring',
        eventDate: '2026-05-13T18:30:00Z',
        extraData: {
          content: 'Weekly review',
          due_date: '2026-05-20T13:00:00',
          completed_due_date_local: '2026-05-13T13:00:00',
        },
      },
      {
        objectId: 'plain',
        eventDate: '2026-05-13T18:30:00Z',
        extraData: { content: 'Plain task' },
      },
    ],
    '2026-05-13'
  );
  assert.equal(recurringSnapshot.length, 1);
  assert.equal(recurringSnapshot[0].id, 'recurring');
  assert.equal(recurringSnapshot[0].isCompleted, true);
  assert.equal(recurringSnapshot[0].completedAt, '2026-05-13T18:30:00Z');
  assert.deepEqual(recurringSnapshot[0].due, {
    date: '2026-05-13T13:00:00',
    datetime: undefined,
    isRecurring: true,
  });

  const immediateSnapshot = buildRecentlyCompletedRecurringTaskSnapshot(
    recurringActive,
    '2026-05-13T18:31:00Z'
  );
  assert.equal(immediateSnapshot?.id, 'recurring');
  assert.equal(immediateSnapshot?.isCompleted, true);
  assert.equal(immediateSnapshot?.completedAt, '2026-05-13T18:31:00Z');
  assert.deepEqual(immediateSnapshot?.due, { date: '2026-05-20', isRecurring: true });
  assert.equal(
    buildRecentlyCompletedRecurringTaskSnapshot(
      task({ id: 'plain', due: { date: '2026-05-20' } }),
      '2026-05-13T18:31:00Z'
    ),
    null
  );
}

runDailyNoteTests();
console.log('daily-note tests passed');
