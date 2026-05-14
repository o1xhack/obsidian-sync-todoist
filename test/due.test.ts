import assert from 'node:assert/strict';
import {
  canPushDueToTodoist,
  dueHash,
  emptyDue,
  formatDueForMarkdown,
  formatDueMetadata,
  normalizeStructuredDue,
  normalizeTodoistDue,
  parseDueMetadata,
  parseMarkdownDue,
  requiresDueMetadata,
  todoistDueUpdate,
} from '../src/due';

const allDay = parseMarkdownDue('Task #todoist 📅 2026-06-01');
assert.equal(allDay.kind, 'date');
assert.equal(allDay.date, '2026-06-01');
assert.equal(allDay.time, null);
assert.equal(formatDueForMarkdown(allDay), '2026-06-01');
assert.deepEqual(todoistDueUpdate(allDay), { dueDate: '2026-06-01' });

const emojiFloating = parseMarkdownDue('Task #todoist 📅 2026-06-01 15:00');
assert.equal(emojiFloating.kind, 'floating');
assert.equal(emojiFloating.date, '2026-06-01');
assert.equal(emojiFloating.time, '15:00');
assert.equal(formatDueForMarkdown(emojiFloating), '2026-06-01 15:00');
assert.deepEqual(todoistDueUpdate(emojiFloating), { dueDatetime: '2026-06-01T15:00:00' });

const textFloating = parseMarkdownDue('Task #todoist due:2026-06-01 7:05');
assert.equal(textFloating.kind, 'floating');
assert.equal(textFloating.time, '07:05');

const naturalLanguage = parseMarkdownDue('Task #todoist every Friday at 15:00');
assert.equal(naturalLanguage.kind, 'none');
assert.equal(naturalLanguage.date, null);

const todoistDate = normalizeTodoistDue({ date: '2026-06-01' });
assert.equal(todoistDate.kind, 'date');
assert.equal(todoistDate.date, '2026-06-01');
assert.equal(formatDueForMarkdown(todoistDate), '2026-06-01');

const todoistFloating = normalizeTodoistDue({
  date: '2026-06-01T15:00:00',
  datetime: '2026-06-01T15:00:00',
});
assert.equal(todoistFloating.kind, 'floating');
assert.equal(todoistFloating.date, '2026-06-01');
assert.equal(todoistFloating.time, '15:00');
assert.equal(canPushDueToTodoist(todoistFloating), true);

const todoistFixed = normalizeTodoistDue({
  date: '2026-06-01T22:00:00Z',
  datetime: '2026-06-01T22:00:00Z',
  timezone: 'America/Los_Angeles',
});
assert.equal(todoistFixed.kind, 'fixed');
assert.equal(todoistFixed.rawDate, '2026-06-01T22:00:00Z');
assert.equal(requiresDueMetadata(todoistFixed), true);
assert.equal(canPushDueToTodoist(todoistFixed), false);
assert.deepEqual(todoistDueUpdate(todoistFixed), {});

const todoistRecurring = normalizeTodoistDue({
  date: '2026-06-01T15:00:00',
  datetime: '2026-06-01T15:00:00',
  string: 'every month on the 1st at 15:00',
  lang: 'en',
  isRecurring: true,
});
assert.equal(todoistRecurring.kind, 'recurring');
assert.equal(todoistRecurring.isRecurring, true);
assert.equal(todoistRecurring.string, 'every month on the 1st at 15:00');
assert.equal(requiresDueMetadata(todoistRecurring), true);
assert.equal(canPushDueToTodoist(todoistRecurring), false);
assert.deepEqual(todoistDueUpdate(todoistRecurring), {});

const recurringMetadata = formatDueMetadata(todoistRecurring);
assert.ok(recurringMetadata?.includes('todoist-due'));
const parsedMetadata = parseDueMetadata(`Task ${recurringMetadata ?? ''}`);
assert.equal(parsedMetadata?.kind, 'recurring');
assert.equal(parsedMetadata?.date, '2026-06-01');
assert.equal(parsedMetadata?.time, '15:00');
assert.equal(parsedMetadata?.rawDate, '2026-06-01T15:00:00');
assert.equal(parsedMetadata?.string, 'every month on the 1st at 15:00');

const malformedMetadata = parseDueMetadata('Task <!-- todoist-due:{not-json} -->');
assert.equal(malformedMetadata, null);

const metadataWinsSafety = parseMarkdownDue(
  `Task #todoist 📅 2026-06-02 16:30 ${recurringMetadata ?? ''}`
);
assert.equal(metadataWinsSafety.kind, 'recurring');
assert.equal(metadataWinsSafety.date, '2026-06-02');
assert.equal(metadataWinsSafety.time, '16:30');
assert.equal(metadataWinsSafety.rawDate, '2026-06-01T15:00:00');

const firstTime = normalizeStructuredDue({
  ...emptyDue('markdown'),
  kind: 'floating',
  date: '2026-06-01',
  time: '15:00',
  rawDate: '2026-06-01T15:00:00',
});
const secondTime = normalizeStructuredDue({
  ...emptyDue('markdown'),
  kind: 'floating',
  date: '2026-06-01',
  time: '16:30',
  rawDate: '2026-06-01T16:30:00',
});
assert.notEqual(dueHash(firstTime), dueHash(secondTime));

const updatedRecurringMetadata = normalizeStructuredDue({
  ...todoistRecurring,
  rawDate: '2026-07-01T15:00:00',
  string: 'every month on the 1st at 15:00 updated',
});
assert.notEqual(
  dueHash(todoistRecurring),
  dueHash(updatedRecurringMetadata),
  'protected Todoist due metadata changes should trigger an Obsidian metadata refresh'
);

console.log('due tests passed');
