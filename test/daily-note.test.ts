import assert from 'node:assert/strict';
import {
  extractTodoistIdsFromMarkerRegion,
  filterDailyNoteTasks,
  isMarkerRegionValid,
  renderDailyNoteTaskBlock,
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
  const wrongDate = task({ id: 'wrong-date', projectId: 'work', priority: TodoistPriority.HIGH, labels: ['writing'], due: { date: '2026-05-12' } });
  const wrongProject = task({ id: 'wrong-project', projectId: 'home', priority: TodoistPriority.HIGH, labels: ['writing'] });
  const completed = task({ id: 'done', projectId: 'work', priority: TodoistPriority.HIGH, labels: ['writing'], isCompleted: true });
  assert.deepEqual(
    filterDailyNoteTasks([wrongDate, wrongProject, completed, matching], settings, '2026-05-13').map(t => t.id),
    ['match']
  );

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
}

runDailyNoteTests();
console.log('daily-note tests passed');
