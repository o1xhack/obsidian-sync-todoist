import assert from 'node:assert/strict';
import { setRequestUrlHandler } from 'obsidian';
import { emptyDue, normalizeStructuredDue } from '../src/due';
import { TodoistService } from '../src/todoist-service';
import { TodoistPriority } from '../src/types';

interface RequestOptions {
  url: string;
  method?: string;
  body?: string;
}

const requests: RequestOptions[] = [];

setRequestUrlHandler((options: unknown) => {
  const request = options as RequestOptions;
  requests.push(request);
  const body = request.body ? JSON.parse(request.body) as Record<string, unknown> : {};
  const dueDatetime = typeof body.due_datetime === 'string' ? body.due_datetime : undefined;
  const dueDate = typeof body.due_date === 'string' ? body.due_date : undefined;
  return {
    json: {
      id: 'task',
      content: body.content ?? 'Task',
      description: body.description ?? '',
      project_id: body.project_id ?? 'inbox',
      parent_id: body.parent_id ?? null,
      priority: body.priority ?? TodoistPriority.NONE,
      due: dueDatetime
        ? { date: dueDatetime, datetime: dueDatetime }
        : dueDate
          ? { date: dueDate }
          : null,
      labels: body.labels ?? [],
      checked: false,
      added_at: '',
      completed_at: null,
    },
  };
});

const service = new TodoistService();
service.initialize('token');

await service.createTask('All-day task', {
  due: normalizeStructuredDue({
    ...emptyDue('markdown'),
    kind: 'date',
    date: '2026-06-01',
    rawDate: '2026-06-01',
  }),
});
assert.deepEqual(JSON.parse(requests.at(-1)?.body ?? '{}'), {
  content: 'All-day task',
  due_date: '2026-06-01',
});

await service.createTask('Floating task', {
  due: normalizeStructuredDue({
    ...emptyDue('markdown'),
    kind: 'floating',
    date: '2026-06-01',
    time: '15:00',
    rawDate: '2026-06-01T15:00:00',
  }),
});
assert.deepEqual(JSON.parse(requests.at(-1)?.body ?? '{}'), {
  content: 'Floating task',
  due_datetime: '2026-06-01T15:00:00',
});

await service.updateTask('task', {
  dueDatetime: '2026-06-02T16:30:00',
});
assert.deepEqual(JSON.parse(requests.at(-1)?.body ?? '{}'), {
  due_datetime: '2026-06-02T16:30:00',
});

await service.updateTask('task', {
  dueDate: '2026-06-03',
});
assert.deepEqual(JSON.parse(requests.at(-1)?.body ?? '{}'), {
  due_date: '2026-06-03',
});

setRequestUrlHandler(null);

console.log('todoist-service due tests passed');
