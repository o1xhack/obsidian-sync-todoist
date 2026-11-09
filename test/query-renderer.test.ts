import assert from 'node:assert/strict';
import {
  buildTaskTree,
  CompletedTaskLookupError,
  CompletedTaskWindow,
  completedWindowRequests,
  CompletedWindowRequest,
  formatCompletedWindowLabel,
  formatQueryHeader,
  loadQueryTasks,
  parseQueryConfig,
  QueryConfig,
  QueryTaskSource,
  renderQueryBlock,
  resolveCompletedWindow,
  TaskTreeNode,
} from '../src/query-renderer';
import type { CompletedTaskQueryOptions } from '../src/todoist-service';
import { TodoistTask } from '../src/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function task(id: string, overrides: Partial<TodoistTask> = {}): TodoistTask {
  return {
    id,
    content: `Task ${id}`,
    description: '',
    projectId: 'work',
    parentId: null,
    priority: 1,
    due: null,
    labels: [],
    isCompleted: false,
    createdAt: '',
    completedAt: null,
    url: `https://todoist.com/app/task/${id}`,
    ...overrides,
  };
}

function completedTask(id: string, completedAt: Date, overrides: Partial<TodoistTask> = {}): TodoistTask {
  return task(id, { isCompleted: true, completedAt: completedAt.toISOString(), ...overrides });
}

function parse(source: string): QueryConfig {
  const result = parseQueryConfig(source);
  assert.equal(result.error, null, `unexpected parse error for:\n${source}`);
  assert.ok(result.config);
  return result.config;
}

function parseError(source: string): string | null {
  const result = parseQueryConfig(source);
  assert.equal(result.config, null);
  return result.error;
}

// ─── completed_only parsing, values, and precedence ──────────────────

for (const value of ['true', 'TRUE', 'yes', '1', 'on', 'On']) {
  const config = parse(`filter: #Work\ncompleted_only: ${value}`);
  assert.equal(config.completedOnly, true, `completed_only: ${value}`);
  assert.equal(config.includeCompleted, true, `completed_only: ${value} implies include_completed`);
}

for (const value of ['false', 'no', '0', 'off', 'OFF']) {
  const config = parse(`filter: #Work\ncompleted_only: ${value}`);
  assert.equal(config.completedOnly, false, `completed_only: ${value}`);
  assert.equal(config.includeCompleted, false, `completed_only: ${value} leaves include_completed off`);
}

for (const value of ['maybe', 'tru', '2', 'enabled']) {
  assert.equal(
    parseError(`filter: #Work\ncompleted_only: ${value}`),
    'Invalid completed_only. Use true or false.',
    `completed_only: ${value} must be rejected instead of silently showing active tasks`
  );
}

for (const source of [
  'filter: #Work\ncompleted_only:',
  'filter: #Work\ncompleted_only:   ',
  'filter: #Work\ncompleted_only:\ninclude_completed: true',
  'filter: #Work\ncompleted_only:   \ninclude_completed: true',
]) {
  assert.equal(parseError(source), 'Invalid completed_only. Use true or false.', `empty completed_only: ${JSON.stringify(source)}`);
}

{
  // Other options keep their previous handling of empty values.
  const config = parse('filter: #Work\ncompleted_by:\ninclude_completed: true');
  assert.equal(config.completedBy, null, 'a bare completed_by: line is still ignored');
  assert.equal(
    parseError('filter: #Work\ncompleted_by:   \ninclude_completed: true'),
    'Invalid completed_by. Use due_date or completion_date.',
    'a whitespace-only completed_by value is still rejected'
  );
}

{
  const config = parse('filter: #Work\ninclude_completed: false\ncompleted_only: true');
  assert.equal(config.completedOnly, true);
  assert.equal(config.includeCompleted, true, 'completed_only wins over include_completed: false');
}

{
  const config = parse('filter: #Work\ncompleted_only: true\ninclude_completed: false');
  assert.equal(config.completedOnly, true);
  assert.equal(config.includeCompleted, true, 'completed_only wins regardless of key order');
}

{
  const config = parse('filter: #Work\ninclude_completed: true\ncompleted_only: false');
  assert.equal(config.completedOnly, false);
  assert.equal(config.includeCompleted, true);
}

{
  const config = parse('filter: #Work\ncompleted_only: true\ncompleted_only: false');
  assert.equal(config.completedOnly, false, 'the last duplicate key wins, like other options');
}

{
  const config = parse('filter: #Work\n  Completed_Only :  Yes  ');
  assert.equal(config.completedOnly, true, 'keys are case-insensitive and values are trimmed');
}

{
  const config = parse('filter: #Work\ninclude_completed: enabled');
  assert.equal(config.includeCompleted, false, 'include_completed keeps its lenient legacy parsing');
  assert.equal(config.completedOnly, false);
}

{
  const config = parse('filter: #Work');
  assert.equal(config.completedOnly, false, 'completed_only defaults to false');
  assert.equal(config.includeCompleted, false);
}

assert.equal(
  parseError('completed_only: true\ncompleted_since: 30d'),
  'Invalid Sync Todoist block. Use: filter: today'
);

{
  const config = parse([
    'filter: #Work',
    'include_completed: true',
    'completed_only: true',
    'completed_since: 30d',
  ].join('\n'));
  assert.deepEqual(config, {
    filter: '#Work',
    includeCompleted: true,
    completedOnly: true,
    completedBy: null,
    completedSince: '30d',
    completedUntil: null,
    completedRange: null,
  });
}

assert.equal(formatQueryHeader(parse('filter: #Work')), 'Filter: #Work');
assert.equal(formatQueryHeader(parse('filter: #Work\ninclude_completed: true')), 'Filter: #Work · including completed');
assert.equal(formatQueryHeader(parse('filter: #Work\ncompleted_only: true')), 'Filter: #Work · completed only');

// ─── Completed windows: completion date vs due date, and date boundaries ──

const now = new Date(2026, 10, 9, 15, 30);

{
  // The issue example: rolling 30 days, by completion date for a project filter.
  const window = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 30d'), now);
  assert.equal(window.by, 'completion_date');
  assert.equal(window.until.getTime(), new Date(2026, 10, 10).getTime());
  assert.equal(window.since.getTime(), new Date(2026, 9, 11).getTime(), '30d is today and the 29 days before it');
  assert.equal(formatCompletedWindowLabel(window), 'Completed: completion date 2026-10-11 to 2026-11-09');
}

{
  // A calendar-month review with explicit dates covers the whole last day.
  const window = resolveCompletedWindow(parse([
    'filter: #Work',
    'completed_only: true',
    'completed_by: completion_date',
    'completed_since: 2026-10-01',
    'completed_until: 2026-10-31',
  ].join('\n')), now);
  assert.equal(window.since.getTime(), new Date(2026, 9, 1).getTime());
  assert.equal(window.until.getTime(), new Date(2026, 10, 1).getTime());
  assert.equal(formatCompletedWindowLabel(window), 'Completed: completion date 2026-10-01 to 2026-10-31');
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Requests must cover the whole window back to back, each within the API limit. */
function assertRequestsCover(window: CompletedTaskWindow, label: string): CompletedWindowRequest[] {
  const maxDays = window.by === 'due_date' ? 42 : 93;
  const requests = completedWindowRequests(window);
  assert.ok(requests.length >= 1, `${label} has requests`);
  assert.equal(requests[0].since.getTime(), window.since.getTime(), `${label} first request starts at the window start`);
  assert.equal(requests[requests.length - 1].until.getTime(), window.until.getTime(), `${label} last request ends at the window end`);
  requests.forEach((request, index) => {
    assert.ok(request.since < request.until, `${label} request ${index} is not empty`);
    assert.ok(request.until.getTime() - request.since.getTime() <= maxDays * DAY_MS, `${label} request ${index} within ${maxDays} × 24h`);
    if (index > 0) assert.equal(request.since.getTime(), requests[index - 1].until.getTime(), `${label} requests are contiguous`);
  });
  return requests;
}

/** In a zone that skips midnight on the given day, other days still start at 00:00. */
function assertMidnightGap(zone: string, year: number, month: number, day: number): void {
  const gapDayStart = new Date(year, month, day);
  assert.equal(gapDayStart.getHours(), 1, `${zone} has no 00:00 on ${isoDate(gapDayStart)}`);
  const gapIso = isoDate(gapDayStart);
  const dayBefore = new Date(year, month, day - 1, 12);
  const dayBeforeIso = isoDate(dayBefore);

  const rolling = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 30d'), dayBefore);
  assert.equal(rolling.until.getTime(), gapDayStart.getTime(), `${zone} 30d ends where the change day starts`);
  assert.equal(rolling.since.getTime(), new Date(year, month, day - 30).getTime(), `${zone} 30d start`);
  assert.equal(rolling.since.getHours(), 0, `${zone} 30d starts at 00:00, not 01:00`);
  assert.equal(formatCompletedWindowLabel(rolling), `Completed: completion date ${isoDate(new Date(year, month, day - 30))} to ${dayBeforeIso}`);

  const maxDue = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_by: due_date\ncompleted_since: 6w'), dayBefore);
  assert.equal(maxDue.since.getTime(), new Date(year, month, day - 42).getTime(), `${zone} 6w ending before the change day is accepted`);
  assert.equal(maxDue.since.getHours(), 0, `${zone} 6w starts at 00:00`);
  assertRequestsCover(maxDue, `${zone} 6w`);

  const explicit = resolveCompletedWindow(parse([
    'filter: #Work',
    'completed_only: true',
    `completed_since: ${isoDate(new Date(year, month, day - 10))}`,
    `completed_until: ${dayBeforeIso}`,
  ].join('\n')), dayBefore);
  assert.equal(explicit.since.getHours(), 0, `${zone} explicit start at 00:00`);
  assert.equal(explicit.until.getTime(), gapDayStart.getTime());

  // The change day itself starts at its first existing time; the next day starts at 00:00.
  const gapRange = resolveCompletedWindow(parse(`filter: #Work\ncompleted_only: true\ncompleted_range: ${gapIso}`), dayBefore);
  assert.equal(gapRange.since.getTime(), gapDayStart.getTime());
  assert.equal(gapRange.until.getTime(), new Date(year, month, day + 1).getTime());
  assert.equal(gapRange.until.getHours(), 0, `${zone} the day after the change starts at 00:00`);
  assert.equal(formatCompletedWindowLabel(gapRange), `Completed: completion date ${gapIso} to ${gapIso}`);

  const yesterday = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_range: yesterday'), new Date(year, month, day + 1, 12));
  assert.equal(yesterday.since.getTime(), gapDayStart.getTime());
  assert.equal(yesterday.until.getHours(), 0);

  // A rolling window that starts on the change day starts at its first existing time.
  const fromGap = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 7d'), new Date(year, month, day + 6, 12));
  assert.equal(fromGap.since.getTime(), gapDayStart.getTime(), `${zone} 7d from the change day`);
  assert.equal(fromGap.until.getTime(), new Date(year, month, day + 7).getTime());
  assert.equal(fromGap.until.getHours(), 0);
  assert.equal(formatCompletedWindowLabel(fromGap), `Completed: completion date ${gapIso} to ${isoDate(new Date(year, month, day + 6))}`);

  const later = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 7d'), new Date(year, month, day + 20, 12));
  assert.equal(later.since.getTime(), new Date(year, month, day + 14).getTime());
  assert.equal(later.since.getHours(), 0);
}

function assertCalendarWindows(): void {
  // Single days that are 23 or 25 hours long in DST zones end at the next local midnight.
  for (const [year, month, day] of [[2026, 9, 25], [2026, 10, 1], [2026, 2, 8], [2026, 2, 29]]) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const window = resolveCompletedWindow(parse(`filter: #Work\ncompleted_only: true\ncompleted_range: ${iso}`), now);
    assert.equal(window.since.getTime(), new Date(year, month, day).getTime(), `${iso} start`);
    assert.equal(window.until.getTime(), new Date(year, month, day + 1).getTime(), `${iso} end`);
    assert.equal(formatCompletedWindowLabel(window), `Completed: completion date ${iso} to ${iso}`);
  }

  const dayAfterEuropeanFallBack = new Date(2026, 9, 26, 12, 0);
  const yesterday = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_range: yesterday'), dayAfterEuropeanFallBack);
  assert.equal(yesterday.since.getTime(), new Date(2026, 9, 25).getTime());
  assert.equal(yesterday.until.getTime(), new Date(2026, 9, 26).getTime());

  const usFallBackDay = new Date(2026, 10, 1, 12, 0);
  const today = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_range: today'), usFallBackDay);
  assert.equal(today.since.getTime(), new Date(2026, 10, 1).getTime());
  assert.equal(today.until.getTime(), new Date(2026, 10, 2).getTime());

  // When "now" is itself a DST change day, default and rolling windows still end at the next local midnight.
  for (const dstDay of [new Date(2026, 9, 25, 12), new Date(2026, 10, 1, 12), new Date(2026, 2, 8, 12), new Date(2026, 2, 29, 12)]) {
    const label = dstDay.toDateString();
    const nextMidnight = new Date(dstDay.getFullYear(), dstDay.getMonth(), dstDay.getDate() + 1).getTime();
    for (const [extra, days] of [['', 30], ['\ncompleted_range: 30d', 30], ['\ncompleted_since: 7d', 7]] as const) {
      const window = resolveCompletedWindow(parse(`filter: #Work\ncompleted_only: true${extra}`), dstDay);
      const name = `${label} ${extra.trim() || 'default'}`;
      assert.equal(window.until.getTime(), nextMidnight, `${name} end`);
      assert.equal(
        window.since.getTime(),
        new Date(dstDay.getFullYear(), dstDay.getMonth(), dstDay.getDate() + 1 - days).getTime(),
        `${name} start`
      );
    }
    const tomorrow = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_range: tomorrow'), dstDay);
    assert.equal(tomorrow.since.getTime(), nextMidnight, `${label} tomorrow start`);
    assert.equal(
      tomorrow.until.getTime(),
      new Date(dstDay.getFullYear(), dstDay.getMonth(), dstDay.getDate() + 2).getTime(),
      `${label} tomorrow end`
    );
  }

  // Rolling windows that cross a DST change start at a local midnight.
  const issueDay = new Date(2026, 10, 9, 12);
  const rolling = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 30d'), issueDay);
  assert.equal(rolling.since.getTime(), new Date(2026, 9, 11).getTime(), '30d across autumn DST');
  assert.equal(formatCompletedWindowLabel(rolling), 'Completed: completion date 2026-10-11 to 2026-11-09');

  const springDay = new Date(2026, 2, 20, 12);
  const spring = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 30d'), springDay);
  assert.equal(spring.since.getTime(), new Date(2026, 1, 19).getTime(), '30d across spring DST');
  assert.equal(formatCompletedWindowLabel(spring), 'Completed: completion date 2026-02-19 to 2026-03-20');

  const rollingFromNow = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 30d\ncompleted_until: now'), issueDay);
  assert.equal(rollingFromNow.since.getTime(), new Date(2026, 9, 10, 12).getTime(), '30d before now keeps the clock time');
  assert.equal(rollingFromNow.until.getTime(), issueDay.getTime());

  // Windows at the limit keep the full requested range; the limit is in calendar days.
  const maxDue = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_by: due_date\ncompleted_since: 6w'), issueDay);
  assert.equal(maxDue.since.getTime(), new Date(2026, 8, 29).getTime(), '6w starts at local midnight, not later');
  assert.equal(maxDue.until.getTime(), new Date(2026, 10, 10).getTime());
  assert.equal(formatCompletedWindowLabel(maxDue), 'Completed: due date 2026-09-29 to 2026-11-09');
  assertRequestsCover(maxDue, '6w');

  for (const [by, since, until, start] of [
    ['completion_date', '2026-09-01', '2026-12-02', new Date(2026, 8, 1)],
    ['due_date', '2026-10-20', '2026-11-30', new Date(2026, 9, 20)],
  ] as const) {
    const window = resolveCompletedWindow(parse([
      'filter: #Work',
      'completed_only: true',
      `completed_by: ${by}`,
      `completed_since: ${since}`,
      `completed_until: ${until}`,
    ].join('\n')), issueDay);
    assert.equal(window.since.getTime(), start.getTime(), `${by} ${since}..${until} keeps its start`);
    assert.equal(formatCompletedWindowLabel(window), `Completed: ${by.replace('_', ' ')} ${since} to ${until}`);
    assertRequestsCover(window, `${by} ${since}..${until}`);
  }
  assert.throws(
    () => resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 2026-09-01\ncompleted_until: 2026-12-03'), issueDay),
    /at most 3m/
  );
  assert.throws(
    () => resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_by: due_date\ncompleted_since: 2026-10-19\ncompleted_until: 2026-11-30'), issueDay),
    /at most 6w/
  );
}

assertCalendarWindows();

{
  // Also check DST zones explicitly, so the boundaries are covered when the suite runs in UTC.
  const originalZone = process.env.TZ;
  const originalOffset = new Date(2026, 0, 1).getTimezoneOffset();
  try {
    for (const zone of ['Europe/Paris', 'America/New_York']) {
      process.env.TZ = zone;
      assert.notEqual(
        new Date(2026, 0, 1).getTimezoneOffset(),
        new Date(2026, 6, 1).getTimezoneOffset(),
        `runtime time zone switch to ${zone} must take effect`
      );
      assertCalendarWindows();

      // These windows contain the autumn change, so 6w is 42 days plus one hour. The whole
      // range is kept and fetched as two requests split at a local midnight.
      const issueDay = new Date(2026, 10, 9, 12);
      const maxDue = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_by: due_date\ncompleted_since: 6w'), issueDay);
      assert.equal(maxDue.since.getTime(), new Date(2026, 8, 29).getTime(), `${zone} 6w keeps 00:00`);
      assert.equal(maxDue.since.getHours(), 0);
      assert.equal(maxDue.until.getTime() - maxDue.since.getTime(), 42 * DAY_MS + 60 * 60 * 1000);
      const maxDueRequests = assertRequestsCover(maxDue, `${zone} 6w`);
      assert.equal(maxDueRequests.length, 2, `${zone} 6w is split into two requests`);
      assert.equal(maxDueRequests[1].since.getHours(), 0, 'the split is at a local midnight');

      const short = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 30d'), issueDay);
      assert.equal(short.until.getTime() - short.since.getTime(), 30 * DAY_MS + 60 * 60 * 1000);
      assert.equal(assertRequestsCover(short, `${zone} 30d`).length, 1, 'windows under the limit use one request');

      // Loading fetches every request, merges duplicates, and never uses partial results.
      const shared = completedTask('in-both', new Date(2026, 9, 20, 12));
      const fake = fakeSource({ completedResponses: [[completedTask('early', new Date(2026, 9, 1, 0, 30)), shared], [shared, completedTask('late', new Date(2026, 10, 9, 23))]] });
      const config = parse('filter: #Work\ncompleted_only: true\ncompleted_by: due_date\ncompleted_since: 6w');
      const loaded = await loadQueryTasks(config, fake.source, issueDay);
      assert.deepEqual(fake.completedCalls.map(call => [call.since.getTime(), call.until.getTime()]), maxDueRequests.map(r => [r.since.getTime(), r.until.getTime()]));
      assert.deepEqual(loaded.tasks.map(t => t.id), ['early', 'in-both', 'late']);
      assert.deepEqual(loaded.completedWindow, maxDue);

      const failing = fakeSource({ completedResponses: [[completedTask('early', new Date(2026, 9, 1))], new Error('Completed task request failed, status 500')] });
      await assert.rejects(
        loadQueryTasks(config, failing.source, issueDay),
        (error: unknown) => error instanceof CompletedTaskLookupError && error.message === 'Completed task request failed, status 500'
      );
      const failingMerged = fakeSource({ active: [task('active')], completedResponses: [[completedTask('early', new Date(2026, 9, 1))], new Error('Completed task request failed, status 500')] });
      const merged = await loadQueryTasks(parse('filter: #Work\ninclude_completed: true\ncompleted_by: due_date\ncompleted_since: 6w'), failingMerged.source, issueDay);
      assert.deepEqual(merged.tasks.map(t => t.id), ['active'], 'a failed second request drops the partial completed results');
      assert.equal(merged.completedWarning, 'Completed task request failed, status 500');
    }

    // Zones that skip midnight: the day after the change starts at 01:00, and that must not
    // move other days' boundaries to 01:00.
    for (const [zone, year, month, day] of [['America/Santiago', 2026, 8, 6], ['America/Havana', 2026, 2, 8]] as const) {
      process.env.TZ = zone;
      assertMidnightGap(zone, year, month, day);
    }
  } finally {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
  assert.equal(new Date(2026, 0, 1).getTimezoneOffset(), originalOffset, 'time zone restored');
}

{
  const window = resolveCompletedWindow(parse([
    'filter: #Work',
    'completed_only: true',
    'completed_since: today',
    'completed_until: now',
  ].join('\n')), now);
  assert.equal(window.since.getTime(), new Date(2026, 10, 9).getTime());
  assert.equal(window.until.getTime(), now.getTime());
  assert.equal(formatCompletedWindowLabel(window), 'Completed: completion date 2026-11-09 to 2026-11-09');
}

{
  // completed_only does not change which completed tasks are selected: the inferred mode
  // and default window match the same block without completed_only.
  for (const filter of ['#Work', '@writing', 'today', 'overdue', '#Work & due before: tomorrow']) {
    const merged = resolveCompletedWindow(parse(`filter: ${filter}\ninclude_completed: true`), now);
    const only = resolveCompletedWindow(parse(`filter: ${filter}\ncompleted_only: true`), now);
    assert.deepEqual(only, merged, `same completed window for ${filter}`);
  }
  const project = resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true'), now);
  assert.equal(project.by, 'completion_date');
  assert.equal(project.since.getTime(), new Date(2026, 9, 11).getTime(), 'default completion window is 30 days');
  const dated = resolveCompletedWindow(parse('filter: today\ncompleted_only: true'), now);
  assert.equal(dated.by, 'due_date');
  assert.equal(dated.since.getTime(), new Date(2026, 8, 29).getTime(), 'default due-date window is the full 42 days');
  assert.equal(formatCompletedWindowLabel(dated), 'Completed: due date 2026-09-29 to 2026-11-09');
}

{
  const window = resolveCompletedWindow(parse('filter: today\ncompleted_only: true\ncompleted_by: completion_date'), now);
  assert.equal(window.by, 'completion_date', 'explicit completed_by overrides inference');
}

{
  const ok = resolveCompletedWindow(parse([
    'filter: #Work',
    'completed_only: true',
    'completed_since: 2026-01-01',
    'completed_until: 2026-04-03',
  ].join('\n')), now);
  assert.equal(ok.since.getTime(), new Date(2026, 0, 1).getTime());
  assert.throws(
    () => resolveCompletedWindow(parse([
      'filter: #Work',
      'completed_only: true',
      'completed_since: 2026-01-01',
      'completed_until: 2026-04-04',
    ].join('\n')), now),
    /Completed completion_date queries can cover at most 3m\./
  );
  assert.throws(
    () => resolveCompletedWindow(parse([
      'filter: #Work',
      'completed_only: true',
      'completed_by: due_date',
      'completed_since: 2026-01-01',
      'completed_until: 2026-02-12',
    ].join('\n')), now),
    /Completed due_date queries can cover at most 6w\./
  );
  assert.throws(
    () => resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: 2026-11-10\ncompleted_until: 2026-11-09'), now),
    /must start before it ends/
  );
  assert.throws(
    () => resolveCompletedWindow(parse('filter: #Work\ncompleted_only: true\ncompleted_since: last month'), now),
    /Invalid completed_since/
  );
}

// ─── Loading: completed_only skips active tasks and fails loudly ─────

interface FakeSourceOptions {
  active?: TodoistTask[];
  completed?: TodoistTask[];
  completedError?: Error;
  /** One response per completed-task call, in order: tasks to return or an error to throw. */
  completedResponses?: Array<TodoistTask[] | Error>;
}

function fakeSource(options: FakeSourceOptions = {}): { source: QueryTaskSource; filteredCalls: string[]; completedCalls: CompletedTaskQueryOptions[] } {
  const filteredCalls: string[] = [];
  const completedCalls: CompletedTaskQueryOptions[] = [];
  return {
    filteredCalls,
    completedCalls,
    source: {
      getFilteredTasks: async (filter: string) => {
        filteredCalls.push(filter);
        return options.active ?? [];
      },
      getCompletedTasks: async (queryOptions: CompletedTaskQueryOptions) => {
        completedCalls.push(queryOptions);
        if (options.completedResponses) {
          const response = options.completedResponses[completedCalls.length - 1];
          assert.ok(response, `unexpected completed-task call ${completedCalls.length}`);
          if (response instanceof Error) throw response;
          return response;
        }
        if (options.completedError) throw options.completedError;
        return options.completed ?? [];
      },
    },
  };
}

{
  const active = [task('active-1'), task('active-2')];
  const completed = [
    completedTask('done-1', new Date(2026, 9, 3, 9)),
    completedTask('done-2', new Date(2026, 9, 20, 18)),
    completedTask('done-1', new Date(2026, 9, 3, 9)),
    task('reopened', { isCompleted: false }),
  ];
  const fake = fakeSource({ active, completed });
  const config = parse('filter: #Work\ncompleted_only: true\ncompleted_since: 2026-10-01\ncompleted_until: 2026-10-31');
  const result = await loadQueryTasks(config, fake.source, now);
  assert.deepEqual(fake.filteredCalls, [], 'completed_only must not query active tasks');
  assert.equal(fake.completedCalls.length, 1);
  assert.deepEqual(fake.completedCalls[0], {
    filterQuery: '#Work',
    by: 'completion_date',
    since: new Date(2026, 9, 1),
    until: new Date(2026, 10, 1),
  });
  assert.deepEqual(result.tasks.map(t => t.id), ['done-1', 'done-2'], 'only completed tasks, deduplicated');
  assert.equal(result.completedWarning, null);
  assert.deepEqual(result.completedWindow, { by: 'completion_date', since: new Date(2026, 9, 1), until: new Date(2026, 10, 1) });
}

{
  const fake = fakeSource({ completed: [] });
  const result = await loadQueryTasks(parse('filter: #Work\ncompleted_only: true'), fake.source, now);
  assert.deepEqual(result.tasks, []);
  assert.deepEqual(fake.filteredCalls, []);
}

{
  const fake = fakeSource({ completedError: new Error('Completed task archive unavailable for this Todoist account') });
  await assert.rejects(
    loadQueryTasks(parse('filter: #Work\ncompleted_only: true'), fake.source, now),
    (error: unknown) => error instanceof CompletedTaskLookupError
      && error.message === 'Completed task archive unavailable for this Todoist account'
  );
  assert.deepEqual(fake.filteredCalls, []);
}

{
  const fake = fakeSource();
  await assert.rejects(
    loadQueryTasks(parse('filter: #Work\ncompleted_only: true\ncompleted_since: someday'), fake.source, now),
    (error: unknown) => error instanceof CompletedTaskLookupError && /Invalid completed_since/.test(error.message)
  );
  assert.equal(fake.completedCalls.length, 0, 'an invalid window never reaches the API');
  assert.deepEqual(fake.filteredCalls, []);
}

{
  const fake = fakeSource();
  await assert.rejects(
    loadQueryTasks(parse('filter: #Work\ncompleted_only: true\ncompleted_range: 4m'), fake.source, now),
    (error: unknown) => error instanceof CompletedTaskLookupError && /at most 3m/.test(error.message)
  );
}

{
  // Existing include_completed behavior is unchanged: merge, dedupe, completed copy wins.
  const fake = fakeSource({
    active: [task('a'), task('shared')],
    completed: [completedTask('shared', new Date(2026, 10, 8)), completedTask('c', new Date(2026, 10, 7))],
  });
  const result = await loadQueryTasks(parse('filter: #Work\ninclude_completed: true'), fake.source, now);
  assert.deepEqual(fake.filteredCalls, ['#Work']);
  assert.equal(fake.completedCalls.length, 1);
  assert.deepEqual(result.tasks.map(t => [t.id, t.isCompleted]), [['a', false], ['shared', true], ['c', true]]);
}

{
  const fake = fakeSource({ active: [task('a')], completedError: new Error('Completed task request failed, status 500') });
  const result = await loadQueryTasks(parse('filter: #Work\ninclude_completed: true'), fake.source, now);
  assert.deepEqual(result.tasks.map(t => t.id), ['a'], 'merged blocks keep active tasks when the completed lookup fails');
  assert.equal(result.completedWarning, 'Completed task request failed, status 500');
}

{
  const fake = fakeSource({ active: [task('a')] });
  const result = await loadQueryTasks(parse('filter: #Work\ncompleted_only: false'), fake.source, now);
  assert.deepEqual(result.tasks.map(t => t.id), ['a']);
  assert.equal(fake.completedCalls.length, 0);
  assert.equal(result.completedWindow, null);
}

// ─── Parent and child tasks ──────────────────────────────────────────

function flatten(nodes: TaskTreeNode[], depth = 0): string[] {
  return nodes.flatMap(node => [`${depth}:${node.task.id}`, ...flatten(node.children, depth + 1)]);
}

{
  // Completing a parent completes its subtasks; every level must be shown.
  const tree = buildTaskTree([
    completedTask('parent', new Date(2026, 9, 5)),
    completedTask('child', new Date(2026, 9, 5), { parentId: 'parent' }),
    completedTask('grandchild', new Date(2026, 9, 5), { parentId: 'child' }),
    completedTask('great-grandchild', new Date(2026, 9, 5), { parentId: 'grandchild' }),
    completedTask('sibling', new Date(2026, 9, 6), { parentId: 'parent' }),
  ]);
  assert.deepEqual(flatten(tree), ['0:parent', '1:child', '2:grandchild', '3:great-grandchild', '1:sibling']);
}

{
  // A completed subtask whose active parent is hidden by completed_only becomes a root.
  const tree = buildTaskTree([
    completedTask('subtask', new Date(2026, 9, 5), { parentId: 'active-parent' }),
    completedTask('other', new Date(2026, 9, 6)),
  ]);
  assert.deepEqual(flatten(tree), ['0:subtask', '0:other']);
}

{
  const tree = buildTaskTree([task('self', { parentId: 'self' }), task('a', { parentId: 'b' }), task('b', { parentId: 'a' })]);
  assert.deepEqual(flatten(tree), ['0:self'], 'malformed parent links do not loop forever');
}

// ─── Rendering with a minimal Obsidian-like DOM ──────────────────────

interface FakeElementOptions {
  cls?: string;
  text?: string;
  type?: string;
}

class FakeElement {
  tagName: string;
  cls: string;
  text: string;
  type: string | undefined;
  checked = false;
  children: FakeElement[] = [];
  attributes: Record<string, string> = {};
  private listeners = new Map<string, Array<() => void>>();

  constructor(tagName: string, options: FakeElementOptions = {}) {
    this.tagName = tagName;
    this.cls = options.cls ?? '';
    this.text = options.text ?? '';
    this.type = options.type;
  }

  createEl(tagName: string, options: FakeElementOptions = {}): FakeElement {
    const child = new FakeElement(tagName, options);
    this.children.push(child);
    return child;
  }

  createDiv(options: FakeElementOptions = {}): FakeElement {
    return this.createEl('div', options);
  }

  createSpan(options: FakeElementOptions = {}): FakeElement {
    return this.createEl('span', options);
  }

  empty(): void {
    this.children = [];
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  get textContent(): string {
    return this.text + this.children.map(child => child.textContent).join('');
  }

  findAll(cls: string): FakeElement[] {
    const own = this.cls.split(/\s+/).includes(cls) ? [this] : [];
    return [...own, ...this.children.flatMap(child => child.findAll(cls))];
  }

  find(cls: string): FakeElement | undefined {
    return this.findAll(cls)[0];
  }
}

interface FakePluginOptions extends FakeSourceOptions {
  reopenError?: Error;
}

function fakePlugin(options: FakePluginOptions = {}) {
  const calls = {
    filtered: [] as string[],
    completed: [] as CompletedTaskQueryOptions[],
    completedIds: [] as string[],
    reopenedIds: [] as string[],
  };
  const todoistService = {
    isInitialized: () => true,
    ensureProjectCache: async () => undefined,
    getProjectName: () => 'Work',
    getFilteredTasks: async (filter: string) => {
      calls.filtered.push(filter);
      return options.active ?? [];
    },
    getCompletedTasks: async (queryOptions: CompletedTaskQueryOptions) => {
      calls.completed.push(queryOptions);
      if (options.completedError) throw options.completedError;
      return options.completed ?? [];
    },
    completeTask: async (id: string) => {
      calls.completedIds.push(id);
      return true;
    },
    reopenTask: async (id: string) => {
      calls.reopenedIds.push(id);
      if (options.reopenError) throw options.reopenError;
      return true;
    },
  };
  return { plugin: { todoistService } as unknown as Parameters<typeof renderQueryBlock>[2], calls };
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function render(source: string, plugin: Parameters<typeof renderQueryBlock>[2]): Promise<FakeElement> {
  const root = new FakeElement('div');
  renderQueryBlock(source, root as unknown as HTMLElement, plugin);
  await flush();
  return root;
}

const monthlyReview = [
  'filter: #Work',
  'completed_only: true',
  'completed_by: completion_date',
  'completed_since: 2026-10-01',
  'completed_until: 2026-10-31',
].join('\n');

{
  const { plugin, calls } = fakePlugin({
    active: [task('active-parent'), task('active-other')],
    completed: [
      completedTask('parent', new Date(2026, 9, 15, 10), { due: { date: '2026-10-20' } }),
      completedTask('child', new Date(2026, 9, 15, 10), { parentId: 'parent' }),
      completedTask('grandchild', new Date(2026, 9, 15, 10), { parentId: 'child' }),
      completedTask('orphan', new Date(2026, 9, 2, 23, 30), { parentId: 'active-parent' }),
    ],
  });
  const root = await render(monthlyReview, plugin);

  assert.equal(root.find('syncist-query-filter-label')?.text, 'Filter: #Work · completed only');
  assert.deepEqual(calls.filtered, [], 'rendering a completed_only block never loads active tasks');
  assert.equal(calls.completed.length, 1);

  const rows = root.findAll('syncist-query-task');
  assert.deepEqual(rows.map(row => row.find('syncist-query-content')?.textContent), ['Task parent', 'Task child', 'Task grandchild', 'Task orphan']);
  assert.deepEqual(rows.map(row => row.cls), [
    'syncist-query-task',
    'syncist-query-task syncist-query-subtask syncist-query-depth-1',
    'syncist-query-task syncist-query-subtask syncist-query-depth-2',
    'syncist-query-task',
  ]);
  assert.ok(rows.every(row => row.find('syncist-query-checkbox')?.checked === true));
  assert.equal(
    rows[0].find('syncist-query-badge')?.text,
    '📁 Work  ·  📅 2026-10-20  ·  ✅ 2026-10-15',
    'completed rows show both the due date and the completion date'
  );
  assert.equal(rows[3].find('syncist-query-badge')?.text, '📁 Work  ·  ✅ 2026-10-02');
  assert.equal(root.find('syncist-query-completed-window')?.text, 'Completed: completion date 2026-10-01 to 2026-10-31');
  assert.equal(root.find('syncist-query-warning'), undefined);
  assert.equal(root.find('syncist-query-error'), undefined);

  // Unchecking reopens the task in Todoist; the row stays until the next refresh.
  const checkbox = rows[1].find('syncist-query-checkbox');
  assert.ok(checkbox);
  checkbox.checked = false;
  checkbox.dispatch('change');
  await flush();
  assert.deepEqual(calls.reopenedIds, ['child']);
  assert.equal(checkbox.checked, false);

  // Refresh queries again and still skips active tasks.
  root.find('syncist-query-refresh')?.dispatch('click');
  await flush();
  assert.equal(calls.completed.length, 2);
  assert.deepEqual(calls.filtered, []);
}

{
  const { plugin, calls } = fakePlugin({
    completed: [completedTask('done', new Date(2026, 9, 15))],
    reopenError: new Error('network down'),
  });
  const root = await render(monthlyReview, plugin);
  const checkbox = root.find('syncist-query-checkbox');
  assert.ok(checkbox);
  checkbox.checked = false;
  checkbox.dispatch('change');
  await flush();
  assert.deepEqual(calls.reopenedIds, ['done']);
  assert.equal(checkbox.checked, true, 'a failed reopen restores the checkbox');
}

{
  const { plugin, calls } = fakePlugin({ active: [task('active')], completed: [] });
  const root = await render(monthlyReview, plugin);
  assert.equal(root.find('syncist-query-empty')?.text, 'No completed tasks match this filter in this date range.');
  assert.equal(root.findAll('syncist-query-task').length, 0, 'active tasks never fill an empty completed_only block');
  assert.equal(root.find('syncist-query-completed-window')?.text, 'Completed: completion date 2026-10-01 to 2026-10-31');
  assert.deepEqual(calls.filtered, []);
}

{
  const { plugin, calls } = fakePlugin({
    active: [task('active')],
    completedError: new Error('Completed task archive unavailable for this Todoist account'),
  });
  const root = await render(monthlyReview, plugin);
  assert.equal(root.find('syncist-query-error')?.text, 'Completed tasks not loaded: Completed task archive unavailable for this Todoist account');
  assert.equal(root.find('syncist-query-empty'), undefined, 'a failed lookup is not reported as an empty result');
  assert.equal(root.findAll('syncist-query-task').length, 0);
  assert.deepEqual(calls.filtered, []);
}

{
  const { plugin, calls } = fakePlugin({ completedError: new Error('Invalid completed task query: Invalid filter') });
  const root = await render('filter: #Work &&\ncompleted_only: true', plugin);
  assert.equal(root.find('syncist-query-error')?.text, 'Completed tasks not loaded: Invalid completed task query: Invalid filter');
  assert.deepEqual(calls.filtered, []);
}

{
  const { plugin, calls } = fakePlugin();
  const root = await render('filter: #Work\ncompleted_only: tru', plugin);
  assert.equal(root.find('syncist-query-error')?.text, 'Invalid completed_only. Use true or false.');
  assert.deepEqual(calls.filtered, []);
  assert.equal(calls.completed.length, 0);
}

{
  // Merged blocks keep their existing behavior: active tasks plus a warning.
  const { plugin, calls } = fakePlugin({
    active: [task('active')],
    completedError: new Error('Completed task archive unavailable for this Todoist account'),
  });
  const root = await render('filter: #Work\ninclude_completed: true', plugin);
  assert.equal(root.find('syncist-query-filter-label')?.text, 'Filter: #Work · including completed');
  assert.deepEqual(calls.filtered, ['#Work']);
  assert.deepEqual(root.findAll('syncist-query-task').map(row => row.find('syncist-query-content')?.textContent), ['Task active']);
  assert.equal(root.find('syncist-query-warning')?.text, 'Completed tasks not loaded: Completed task archive unavailable for this Todoist account');
  assert.equal(root.find('syncist-query-error'), undefined);
}

{
  const { plugin } = fakePlugin({ active: [] });
  const root = await render('filter: #Work', plugin);
  assert.equal(root.find('syncist-query-empty')?.text, 'No tasks match this filter.');
  assert.equal(root.find('syncist-query-completed-window'), undefined);
}

{
  // Plain filter blocks with one subtask level keep their previous order and subtask class.
  const { plugin, calls } = fakePlugin({
    active: [
      task('child-b', { parentId: 'parent' }),
      task('parent'),
      task('orphan', { parentId: 'not-in-result' }),
      task('child-a', { parentId: 'parent' }),
    ],
  });
  const root = await render('filter: #Work', plugin);
  assert.equal(calls.completed.length, 0);
  const rows = root.findAll('syncist-query-task');
  assert.deepEqual(rows.map(row => row.find('syncist-query-content')?.textContent), ['Task parent', 'Task child-b', 'Task child-a', 'Task orphan']);
  assert.deepEqual(rows.map(row => row.cls.split(' ').includes('syncist-query-subtask')), [false, true, true, false]);
  assert.ok(rows.every(row => row.find('syncist-query-checkbox')?.checked === false));
  assert.ok(rows.every(row => !(row.find('syncist-query-badge')?.text ?? '').includes('✅')), 'active rows have no completion badge');
}

console.log('query-renderer tests passed');
