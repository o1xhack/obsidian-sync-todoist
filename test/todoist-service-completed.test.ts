import assert from 'node:assert/strict';
import { setRequestUrlHandler } from 'obsidian';
import { TodoistService } from '../src/todoist-service';

interface RequestOptions {
  url: string;
}

interface FakeResponse {
  status: number;
  json: unknown;
}

function rawTask(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    content: `Task ${id}`,
    description: '',
    project_id: 'work',
    parent_id: null,
    priority: 1,
    due: null,
    labels: [],
    checked: true,
    added_at: '2026-10-01T00:00:00Z',
    completed_at: '2026-10-15T17:00:00Z',
    ...overrides,
  };
}

const requests: URL[] = [];
let respond: (url: URL) => FakeResponse = () => ({ status: 500, json: null });

setRequestUrlHandler((options: unknown) => {
  const url = new URL((options as RequestOptions).url);
  requests.push(url);
  return respond(url);
});

const service = new TodoistService();
service.initialize('token');

const since = new Date('2026-10-01T07:00:00.000Z');
const until = new Date('2026-11-01T07:00:00.000Z');

// Completion-date lookups follow next_cursor until the last page omits it.
respond = (url: URL) => {
  assert.equal(url.pathname, '/api/v1/tasks/completed/by_completion_date');
  const cursor = url.searchParams.get('cursor');
  if (!cursor) {
    return { status: 200, json: { items: [rawTask('a'), rawTask('b', { parent_id: 'a' })], next_cursor: 'page.two' } };
  }
  if (cursor === 'page.two') {
    return { status: 200, json: { items: [rawTask('c', { checked: undefined })], next_cursor: 'page.three' } };
  }
  assert.equal(cursor, 'page.three');
  return { status: 200, json: { items: [rawTask('d')] } };
};

const completed = await service.getCompletedTasks({ filterQuery: '#Work', by: 'completion_date', since, until });
assert.deepEqual(completed.map(task => task.id), ['a', 'b', 'c', 'd']);
assert.ok(completed.every(task => task.isCompleted), 'completed endpoint results default to completed');
assert.equal(completed[1].parentId, 'a');
assert.equal(completed[0].completedAt, '2026-10-15T17:00:00Z');
assert.equal(requests.length, 3);
for (const [index, request] of requests.entries()) {
  assert.equal(request.searchParams.get('since'), since.toISOString());
  assert.equal(request.searchParams.get('until'), until.toISOString());
  assert.equal(request.searchParams.get('filter_query'), '#Work');
  assert.equal(request.searchParams.get('limit'), '200');
  assert.equal(request.searchParams.get('cursor'), [null, 'page.two', 'page.three'][index]);
}

// Due-date lookups use the due-date endpoint and omit filter_query when there is none.
requests.length = 0;
respond = (url: URL) => {
  assert.equal(url.pathname, '/api/v1/tasks/completed/by_due_date');
  return { status: 200, json: { items: [rawTask('due')], next_cursor: null } };
};
const dueCompleted = await service.getCompletedTasks({ by: 'due_date', since, until });
assert.deepEqual(dueCompleted.map(task => task.id), ['due']);
assert.equal(requests.length, 1);
assert.equal(requests[0].searchParams.has('filter_query'), false);

// The API may report a reopened task as unchecked; it must not be marked completed.
respond = () => ({ status: 200, json: { items: [rawTask('reopened', { checked: false })] } });
const reopened = await service.getCompletedTasks({ filterQuery: '#Work', by: 'completion_date', since, until });
assert.equal(reopened[0].isCompleted, false);

// Errors are surfaced with messages the query block shows to the user.
respond = () => ({ status: 400, json: { error: 'Invalid filter' } });
await assert.rejects(
  service.getCompletedTasks({ filterQuery: '#Work &&', by: 'completion_date', since, until }),
  /^Error: Invalid completed task query: Invalid filter$/
);

respond = () => ({ status: 403, json: null });
await assert.rejects(
  service.getCompletedTasks({ filterQuery: '#Work', by: 'completion_date', since, until }),
  /Completed task archive unavailable for this Todoist account/
);

respond = () => ({ status: 503, json: null });
await assert.rejects(
  service.getCompletedTasks({ filterQuery: '#Work', by: 'completion_date', since, until }),
  /Completed task request failed, status 503/
);

setRequestUrlHandler(null);

console.log('todoist-service completed tests passed');
