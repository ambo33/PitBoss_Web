import assert from 'node:assert/strict';
import test from 'node:test';
import { easternEventStart, eventStartDue } from '../src/services/eventNotificationTiming';
import { NOTIFICATION_TYPE_CATEGORY, NOTIFICATION_CATEGORY_META } from '../src/lib/server/notifications/types';
import { buildNotificationPayload } from '../src/lib/server/notifications/templates';

test('start alerts open at the scheduled New York time and close after the retry window', () => {
  const date = '2026-09-16';
  const time = '19:00';
  assert.equal(easternEventStart(date, time)?.toISOString(), '2026-09-16T23:00:00.000Z');
  assert.equal(eventStartDue(date, time, new Date('2026-09-16T22:59:59Z')), false);
  assert.equal(eventStartDue(date, time, new Date('2026-09-16T23:00:00Z')), true);
  assert.equal(eventStartDue(date, time, new Date('2026-09-16T23:14:59Z')), true);
  assert.equal(eventStartDue(date, time, new Date('2026-09-16T23:15:00Z')), false);
  assert.equal(eventStartDue(date, null, new Date('2026-09-16T23:00:00Z')), false);
});

test('New York winter, summer, and midnight starts use the event date', () => {
  assert.equal(easternEventStart('2026-01-10', '19:00')?.toISOString(), '2026-01-11T00:00:00.000Z');
  assert.equal(easternEventStart('2026-07-10', '19:00')?.toISOString(), '2026-07-10T23:00:00.000Z');
  assert.equal(eventStartDue('2026-09-16', '23:55', new Date('2026-09-17T04:05:00Z')), true);
  assert.equal(easternEventStart('2026-03-08', '03:30')?.toISOString(), '2026-03-08T07:30:00.000Z');
  assert.equal(easternEventStart('2026-03-08', '02:30'), null);
  assert.equal(easternEventStart('2026-11-01', '01:30')?.toISOString(), '2026-11-01T05:30:00.000Z');
});

test('league knockout push has its own default-on preference and opens the event', () => {
  assert.equal(NOTIFICATION_TYPE_CATEGORY.league_knockout, 'league_knockouts');
  assert.equal(NOTIFICATION_CATEGORY_META.league_knockouts.defaultEnabled, true);
  const payload = buildNotificationPayload('league_knockout', {
    eventName: 'Event #2',
    playerName: 'Alex',
    url: '/league/league-id/event/event-id',
    tag: 'league-league-id-event-event-id-knockout-player-id',
  });
  assert.equal(payload.body, 'Alex was knocked out.');
  assert.equal(payload.url, '/league/league-id/event/event-id');
  assert.equal(payload.tag, 'league-league-id-event-event-id-knockout-player-id');
});
