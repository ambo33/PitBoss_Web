import assert from 'node:assert/strict';
import { buildIssueFingerprint, normalizeIssuePath, sanitizeIssuePath, sanitizeIssueText } from '../src/services/issueReporter';

assert.equal(
  normalizeIssuePath('/api/leagues/8c341ca4-99c1-4ee1-8bd8-3c86d0783b43/seasons/9f35c3a1-4af2-43a8-a3bb-850fdcfec4aa/members'),
  '/api/leagues/:id/seasons/:id/members'
);
assert.equal(sanitizeIssuePath('https://app.thepokerplanner.com/league/abc?invite=private-token'), '/league/abc');
assert.equal(
  sanitizeIssueText('Authorization: Bearer top-secret password=hunter2'),
  'Authorization: Bearer [redacted] password=[redacted]'
);

const firstFingerprint = buildIssueFingerprint({
  source: 'client',
  kind: 'request_timeout',
  message: 'Request exceeded 20 seconds',
  method: 'POST',
  requestPath: '/api/leagues/8c341ca4-99c1-4ee1-8bd8-3c86d0783b43/seasons/9f35c3a1-4af2-43a8-a3bb-850fdcfec4aa/members',
});
const secondFingerprint = buildIssueFingerprint({
  source: 'client',
  kind: 'request_timeout',
  message: 'Request exceeded 20 seconds',
  method: 'POST',
  requestPath: '/api/leagues/1546db6f-583e-47e8-a777-e037e5504036/seasons/323f06c9-59df-41e0-b45e-c36ac6c8c682/members',
});
assert.equal(firstFingerprint, secondFingerprint, 'Equivalent route failures should share one admin issue');

console.log('Automatic issue reporting tests passed.');
