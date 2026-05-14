import assert from 'node:assert/strict';
import { buildTaskLine, parseTaskLine } from '../src/task-parser';
import { TodoistService } from '../src/todoist-service';
import { TodoistPriority, TodoistTask } from '../src/types';
import { normalizeTodoistDue } from '../src/due';

function task(overrides: Partial<TodoistTask>): TodoistTask {
  return {
    id: '1',
    content: 'Timed recurring task',
    description: '',
    projectId: 'inbox',
    parentId: null,
    priority: TodoistPriority.NONE,
    due: null,
    labels: [],
    isCompleted: false,
    createdAt: '',
    completedAt: null,
    url: 'https://todoist.com/app/task/1',
    ...overrides,
  };
}

const parsedTimedEmoji = parseTaskLine(
  '- [ ] Timed task #todoist 📅 2026-05-13T15:00:00 <!-- todoist-id:abc -->',
  0,
  'Daily/2026-05-13.md',
  '#todoist',
  Date.now()
);
assert.equal(parsedTimedEmoji?.content, 'Timed task');
assert.equal(parsedTimedEmoji?.dueDate, '2026-05-13');

const parsedTimedText = parseTaskLine(
  '- [ ] Timed task #todoist due:2026-05-13 15:00:00',
  0,
  'Tasks.md',
  '#todoist',
  Date.now()
);
assert.equal(parsedTimedText?.content, 'Timed task');
assert.equal(parsedTimedText?.dueDate, '2026-05-13');

assert.equal(
  TodoistService.parseDueDate(task({ due: { date: '2026-05-13T15:00:00' } })),
  '2026-05-13'
);
assert.equal(
  TodoistService.parseDueDate(task({ due: { date: '2026-05-20', datetime: '2026-05-13T15:00:00' } })),
  '2026-05-13'
);

const recurringLine = buildTaskLine(
  {
    originalLine: '',
    lineNumber: 0,
    filePath: 'Tasks.md',
    content: 'Monthly payment',
    isCompleted: false,
    todoistId: 'abc',
    parentId: null,
    indentLevel: 0,
    dueDate: '2026-06-01',
    due: normalizeTodoistDue({
      date: '2026-06-01T15:00:00',
      datetime: '2026-06-01T15:00:00',
      string: 'every month on the 1st at 15:00',
      lang: 'en',
      isRecurring: true,
    }),
    priority: TodoistPriority.NONE,
    labels: [],
    description: '',
    projectId: null,
    projectName: null,
    lastModified: Date.now(),
  },
  '#todoist'
);
assert.match(recurringLine, /📅 2026-06-01 15:00/);
assert.match(recurringLine, /todoist-due:/);
assert.match(recurringLine, /todoist-id:abc/);

const parsedRecurringLine = parseTaskLine(recurringLine, 0, 'Tasks.md', '#todoist', Date.now());
assert.equal(parsedRecurringLine?.content, 'Monthly payment');
assert.equal(parsedRecurringLine?.due?.kind, 'recurring');
assert.equal(parsedRecurringLine?.due?.time, '15:00');

console.log('task-parser tests passed');
