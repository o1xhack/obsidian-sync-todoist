import assert from 'node:assert/strict';
import {
  applyDailyNoteCleanupToContent,
  completedTaskCleanupRanges,
  DailyNoteCleanupTaskState,
} from '../src/daily-note-cleanup';

const START = '%% sync-todoist:daily:start %%';
const END = '%% sync-todoist:daily:end %%';

function state(overrides: Partial<DailyNoteCleanupTaskState>): DailyNoteCleanupTaskState {
  return {
    isActive: true,
    isCompleted: false,
    currentDueDate: '2026-05-10',
    ...overrides,
  };
}

const content = [
  '# 2026-05-10',
  START,
  '- [ ] Moved task #todoist 📅 2026-05-10 <!-- todoist-id:moved -->',
  '- [ ] Done task #todoist 📅 2026-05-10 <!-- todoist-id:done -->',
  '- [ ] Current task #todoist 📅 2026-05-10 <!-- todoist-id:current -->',
  '- [x] Already done #todoist 📅 2026-05-10 <!-- todoist-id:already -->',
  END,
].join('\n');

const lookup = (id: string): DailyNoteCleanupTaskState | null => {
  if (id === 'moved') return state({ currentDueDate: '2026-05-16' });
  if (id === 'done') return state({ isActive: false, isCompleted: true, currentDueDate: null });
  if (id === 'current') return state({});
  if (id === 'already') return state({ isActive: false, isCompleted: true, currentDueDate: null });
  return null;
};

const removeStale = applyDailyNoteCleanupToContent(
  content,
  START,
  END,
  '2026-05-10',
  { mode: 'remove-stale-unfinished', markCompletedAlso: false },
  lookup
);
assert.equal(removeStale.stats.removedStaleUnfinished, 1);
assert.equal(removeStale.stats.markedCompleted, 0);
assert.match(removeStale.content, /Done task/);
assert.doesNotMatch(removeStale.content, /Moved task/);

const removeStaleAndMark = applyDailyNoteCleanupToContent(
  content,
  START,
  END,
  '2026-05-10',
  { mode: 'remove-stale-unfinished', markCompletedAlso: true },
  lookup
);
assert.equal(removeStaleAndMark.stats.removedStaleUnfinished, 1);
assert.equal(removeStaleAndMark.stats.markedCompleted, 1);
assert.match(removeStaleAndMark.content, /- \[x\] Done task/);

const markCompleted = applyDailyNoteCleanupToContent(
  content,
  START,
  END,
  '2026-05-10',
  { mode: 'mark-completed', markCompletedAlso: false },
  lookup
);
assert.equal(markCompleted.stats.markedCompleted, 1);
assert.match(markCompleted.content, /Moved task/);
assert.match(markCompleted.content, /- \[x\] Done task/);

const removeCompleted = applyDailyNoteCleanupToContent(
  content,
  START,
  END,
  '2026-05-10',
  { mode: 'remove-completed', markCompletedAlso: false },
  lookup
);
assert.equal(removeCompleted.stats.removedCompleted, 2);
assert.doesNotMatch(removeCompleted.content, /Done task/);
assert.doesNotMatch(removeCompleted.content, /Already done/);
assert.match(removeCompleted.content, /Moved task/);

const longCompletedRanges = completedTaskCleanupRanges('2026-01-01', '2026-05-16');
assert.ok(longCompletedRanges.length > 1);
assert.equal(longCompletedRanges[0].since.toISOString().slice(0, 10), '2026-01-01');
assert.equal(longCompletedRanges.at(-1)?.until.toISOString().slice(0, 10), '2026-05-17');
for (const range of longCompletedRanges) {
  const days = (range.until.getTime() - range.since.getTime()) / 86400000;
  assert.ok(days <= 41, `range is too large: ${days} days`);
}

console.log('daily-note cleanup tests passed');
