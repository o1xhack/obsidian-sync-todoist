import assert from 'node:assert/strict';
import { formatBuildDate } from '../src/build-info';
import { t } from '../src/i18n';

assert.equal(formatBuildDate('not-a-date'), 'not-a-date');
assert.notEqual(formatBuildDate('2026-05-14T03:20:00.000Z'), '2026-05-14T03:20:00.000Z');
assert.match(
  t('en', 'general.version.value', { version: '0.8.0', date: '5/16/2026' }),
  /0\.8\.0 \(Build 5\/16\/2026\)/
);
assert.match(
  t('zh-CN', 'general.version.value', { version: '0.8.0', date: '2026/5/16' }),
  /0\.8\.0（Build 2026\/5\/16）/
);

console.log('build-info tests passed');
