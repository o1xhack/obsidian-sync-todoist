import assert from 'node:assert/strict';
import { entryForVersion, isVersionNewer, RELEASE_LOG } from '../src/release-log';

assert.equal(entryForVersion('0.9.0')?.version, '0.9.0');
assert.equal(entryForVersion('1.0.0')?.version, '1.0.0');
assert.equal(RELEASE_LOG[0].version, '1.0.0');
assert.equal(isVersionNewer('0.8.0', '0.7.0'), true);
assert.equal(isVersionNewer('0.8.0', '0.8.0'), false);
assert.equal(isVersionNewer('0.7.10', '0.7.9'), true);
assert.equal(isVersionNewer('0.8.0', ''), true);

console.log('release-log tests passed');
