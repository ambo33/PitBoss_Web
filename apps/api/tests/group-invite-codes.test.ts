import assert from 'node:assert/strict';
import {
  generateGroupInviteCode,
  isValidGroupInviteCode,
  normalizeGroupInviteCode,
} from '../src/groupInviteCode';

const generatedCode = generateGroupInviteCode();
assert.equal(generatedCode.length, 6, 'Generated group codes should remain six characters by default');
assert.match(generatedCode, /^[A-Z2-9]+$/);

assert.equal(normalizeGroupInviteCode('  north   room  '), 'NORTH ROOM');
assert.equal(isValidGroupInviteCode('NORTH ROOM'), true);
assert.equal(isValidGroupInviteCode('1234567890'), true);
assert.equal(isValidGroupInviteCode('12345678901'), false);
assert.equal(isValidGroupInviteCode('NO-DASHES'), false);
assert.equal(isValidGroupInviteCode(''), false);

console.log('Group invite code tests passed.');
