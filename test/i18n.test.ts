import assert from 'node:assert/strict';
import { t } from '../src/i18n';

assert.equal(t('en', 'tab.general'), 'General');
assert.equal(t('zh-CN', 'tab.general'), '通用');
assert.equal(t('en', 'general.status.synced', { count: 3 }), 'Synced tasks: 3');
assert.equal(t('zh-CN', 'general.status.synced', { count: 3 }), '已同步任务：3');
assert.match(t('en', 'daily.warning'), /rewrites everything between these markers/);
assert.match(t('zh-CN', 'daily.warning'), /完整重写这两个 Marker 之间/);

console.log('i18n tests passed');
