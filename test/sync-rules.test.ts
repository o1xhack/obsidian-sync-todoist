import assert from 'node:assert/strict';
import {
  canCompleteTodoistFromGeneratedDailyNote,
  selectTaskForTodoistSync,
  shouldPushDueDateToTodoist,
} from '../src/sync-rules';
import { ParsedObsidianTask, TodoistPriority, TodoistTask } from '../src/types';

function obsidianTask(overrides: Partial<ParsedObsidianTask>): ParsedObsidianTask {
  return {
    originalLine: '- [ ] Task #todoist <!-- todoist-id:task -->',
    lineNumber: 1,
    filePath: 'Tasks.md',
    content: 'Task',
    isCompleted: false,
    todoistId: 'task',
    parentId: null,
    indentLevel: 0,
    dueDate: '2026-05-13',
    priority: TodoistPriority.NONE,
    labels: [],
    description: '',
    projectId: null,
    projectName: null,
    lastModified: Date.now(),
    ...overrides,
  };
}

function todoistTask(overrides: Partial<TodoistTask>): TodoistTask {
  return {
    id: 'task',
    content: 'Task',
    description: '',
    projectId: 'inbox',
    parentId: null,
    priority: TodoistPriority.NONE,
    due: { date: '2026-05-13' },
    labels: [],
    isCompleted: false,
    createdAt: '',
    completedAt: null,
    url: 'https://todoist.com/app/task/task',
    ...overrides,
  };
}

const regular = obsidianTask({ filePath: 'Tasks.md', isDailyNoteGenerated: false });
const generatedOpen = obsidianTask({
  filePath: 'Daily/2026-05-13.md',
  isDailyNoteGenerated: true,
});
const generatedChecked = obsidianTask({
  filePath: 'Daily/2026-05-13.md',
  isCompleted: true,
  isDailyNoteGenerated: true,
});

assert.equal(
  selectTaskForTodoistSync([regular, generatedOpen], todoistTask({})),
  regular,
  'ordinary bidirectional link should win when Daily Note row was not checked'
);

assert.equal(
  selectTaskForTodoistSync([regular, generatedChecked], todoistTask({ isCompleted: false })),
  generatedChecked,
  'checked Daily Note row should be selected so completion can sync to Todoist'
);

assert.equal(
  canCompleteTodoistFromGeneratedDailyNote(
    generatedChecked,
    todoistTask({ due: { date: '2026-05-13', isRecurring: true } })
  ),
  true,
  'generated row can complete the current recurring occurrence when dates match'
);

assert.equal(
  canCompleteTodoistFromGeneratedDailyNote(
    generatedChecked,
    todoistTask({ due: { date: '2026-05-20', isRecurring: true } })
  ),
  false,
  'old checked generated row must not complete the next recurring occurrence'
);

assert.equal(
  shouldPushDueDateToTodoist(
    obsidianTask({ dueDate: '2026-05-14' }),
    todoistTask({ due: { date: '2026-05-13' } }),
    '2026-05-13'
  ),
  true,
  'plain Todoist due dates can still be updated from ordinary Obsidian tasks'
);

assert.equal(
  shouldPushDueDateToTodoist(
    obsidianTask({ dueDate: '2026-05-13' }),
    todoistTask({ due: { date: '2026-05-20', datetime: '2026-05-13T15:00:00' } }),
    '2026-05-20'
  ),
  false,
  'timed Todoist due dates must not be downgraded to date-only Markdown'
);

assert.equal(
  shouldPushDueDateToTodoist(
    obsidianTask({ dueDate: '2026-05-13' }),
    todoistTask({ due: { date: '2026-05-20', isRecurring: true } }),
    '2026-05-20'
  ),
  false,
  'recurring Todoist due rules must not be downgraded to one-time date-only Markdown'
);

console.log('sync-rules tests passed');
