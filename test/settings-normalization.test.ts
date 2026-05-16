import assert from 'node:assert/strict';
import { normalizeDailyNoteSettings } from '../src/settings-normalization';

const oldEnabledSettings = normalizeDailyNoteSettings({
  includeCompleted: true,
  includeCompletedRecurring: true,
});
assert.equal(oldEnabledSettings.completedTaskMode, 'completed-today');
assert.equal(oldEnabledSettings.includeIncompleteRecurring, true);
assert.equal(oldEnabledSettings.includeCompletedRecurring, true);

const oldDisabledSettings = normalizeDailyNoteSettings({
  includeCompleted: false,
  includeCompletedRecurring: true,
});
assert.equal(oldDisabledSettings.completedTaskMode, 'off');
assert.equal(oldDisabledSettings.includeIncompleteRecurring, true);
assert.equal(oldDisabledSettings.includeCompletedRecurring, false);

const newSettings = normalizeDailyNoteSettings({
  includeIncompleteRecurring: false,
  completedTaskMode: 'due-today',
  includeCompletedRecurring: true,
});
assert.equal(newSettings.includeIncompleteRecurring, false);
assert.equal(newSettings.completedTaskMode, 'due-today');
assert.equal(newSettings.includeCompletedRecurring, true);

console.log('settings normalization tests passed');
