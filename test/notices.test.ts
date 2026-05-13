import assert from 'node:assert/strict';
import {
  formatDailyNoteSummary,
  formatSyncResult,
  noticeDurationForResult,
} from '../src/notices';

function runNoticeTests(): void {
  assert.equal(
    formatSyncResult({
      created: 0,
      updated: 0,
      completed: 0,
      conflicts: 0,
      errors: [],
      dailyNote: { status: 'skipped_no_tasks', taskCount: 0 },
    }),
    'Sync done: 0 created, 0 updated, 0 completed, 0 conflicts, daily note 0 tasks.'
  );

  assert.equal(
    formatDailyNoteSummary({ status: 'updated', taskCount: 5 }),
    'daily note 5 tasks'
  );

  assert.equal(
    noticeDurationForResult({
      created: 0,
      updated: 0,
      completed: 0,
      conflicts: 0,
      errors: [],
    }),
    5000
  );

  assert.equal(
    noticeDurationForResult({
      created: 0,
      updated: 0,
      completed: 0,
      conflicts: 0,
      errors: ['boom'],
    }),
    10000
  );
}

runNoticeTests();
console.log('notice tests passed');
