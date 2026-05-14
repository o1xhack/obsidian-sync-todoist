import assert from 'node:assert/strict';
import { formatBuildDate } from '../src/build-info';
import { t } from '../src/i18n';

assert.equal(formatBuildDate('not-a-date'), 'not-a-date');
assert.notEqual(formatBuildDate('2026-05-14T03:20:00.000Z'), '2026-05-14T03:20:00.000Z');
assert.match(
  t('en', 'general.buildInfo.desc', { version: '0.7.0', build: '202605140320', date: '5/14/2026' }),
  /Version 0\.7\.0 .* Build 202605140320/
);
assert.match(
  t('zh-CN', 'general.buildInfo.desc', { version: '0.7.0', build: '202605140320', date: '2026/5/14' }),
  /版本 0\.7\.0 .* Build 202605140320/
);

console.log('build-info tests passed');
