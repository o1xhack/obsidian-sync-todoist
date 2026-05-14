import assert from 'node:assert/strict';
import { parseTaskLine } from '../src/task-parser';
import { TodoistService } from '../src/todoist-service';
import { TodoistPriority, TodoistTask } from '../src/types';

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

console.log('task-parser tests passed');
