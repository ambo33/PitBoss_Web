import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { easternEventStart, eventStartDue } from '../../src/services/eventNotificationTiming';

const tournamentId = '00000000-0000-4000-8000-000000000001';
const leagueId = '00000000-0000-4000-8000-000000000002';
const seasonId = '00000000-0000-4000-8000-000000000003';
const userId = '00000000-0000-4000-8000-000000000004';

export function loadReminderJob(options: {
  now?: string;
  eventTime?: string;
  recaps?: boolean;
  validateSelect?: (sql: string, params: unknown[]) => Promise<void>;
} = {}) {
  const handlers = new Map<string, Function>();
  const reads: Array<{ sql: string; params: unknown[] }> = [];
  const emails: Array<{ mode: string; details: Record<string, unknown> }> = [];
  const deliveries = new Map<string, { id: string; status: string }>();
  const now = options.now ?? '2026-10-21T12:00:00Z';
  const recipient = (kind: 'tournament' | 'league', date: string) => ({
    entityid: kind === 'tournament' ? tournamentId : leagueId, userid: userId,
    emailaddress: 'fixture@example.invalid', emailencrypted: 'fixture-ciphertext',
    name: 'Fixture event', containername: 'Fixture community', eventdate: date,
    eventtime: options.eventTime ?? '19:00:00', url: kind === 'tournament' ? `/lobby/${tournamentId}` : `/league/${leagueId}/event/${leagueId}`,
  });
  const query = async (sql: string, params: unknown[] = []) => {
    if (/^UPDATE scheduleddeliveries/.test(sql.trim())) {
      const delivery = [...deliveries.values()].find(row => row.id === params[0]);
      assert(delivery);
      delivery.status = String(params[1]);
      return [];
    }
    assert.match(sql.trim(), /^SELECT\b/, 'Only SELECTs and isolated delivery updates are supported');
    assert.doesNotMatch(sql, /\bt\.active\b/, 'The real tournaments schema has no active column');
    reads.push({ sql, params });
    await options.validateSelect?.(sql, params);
    if (sql.includes('NULL::UUID AS leagueid') || sql.includes('AS emailallowed')) return [];
    if (sql.includes('FROM tournaments t') && sql.includes('WHERE t.date >= ')) return options.recaps
      ? [{ entityid: tournamentId, name: 'Fixture tournament', containername: 'Fixture group' }] : [];
    if (sql.includes('FROM leagueevents e') && sql.includes('WHERE e.eventdate >= ')) return options.recaps
      ? [{ entityid: leagueId, leagueid: leagueId, seasonid: seasonId, name: 'Fixture league event', containername: 'Fixture league' }] : [];
    if (sql.includes('AS place,')) return [{ place: 1, playername: 'Fixture winner', points: 100 }];
    if (/SELECT (?:tp|lm)\.userid, u\.emailaddress/.test(sql)) return [{ userid: userId, emailaddress: 'fixture@example.invalid', emailencrypted: 'fixture-ciphertext' }];
    if (sql.includes('gm.userid,') && sql.includes('WHERE t.date = $1')) return [recipient('tournament', String(params[0]))];
    if (sql.includes('lm.userid,') && sql.includes('WHERE e.eventdate = $1')) return [recipient('league', String(params[0]))];
    throw new Error('Unexpected scheduled job SELECT');
  };
  const queryOne = async (sql: string, params: unknown[]) => {
    assert.match(sql.trim(), /^INSERT INTO scheduleddeliveries/);
    const key = params.join('|');
    if (deliveries.has(key)) return null;
    const delivery = { id: `fixture-delivery-${deliveries.size}`, status: 'pending' };
    deliveries.set(key, delivery);
    return { deliveryid: delivery.id };
  };
  const emailModule = Object.fromEntries([
    ['sendRsvpReminderEmail', 'rsvp'], ['sendEventTodayReminderEmail', 'today'],
    ['sendEventLobbyReminderEmail', 'one_hour'], ['sendEventStartEmail', 'start'],
    ['sendEventRecapEmail', 'recap'], ['sendTournamentReminderEmail', 'legacy'],
    ['sendLeagueEventReminderEmail', 'legacy_league'],
  ].map(([name, mode]) => [name, async (_to: string, details: Record<string, unknown>) => emails.push({ mode, details })]));
  const source = readFileSync(path.join(__dirname, '../../src/routes/jobs.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: {}, Intl, Promise, console,
    Date: class extends Date { constructor(value?: string | number) { super(value ?? now); } },
    process: { env: { JOB_SECRET: 'fixture-job-secret' } },
    require: (name: string) => {
      if (name === 'express') return { Router: () => ({ post: (url: string, handler: Function) => handlers.set(url, handler) }) };
      if (name === '../db') return { query, queryOne };
      if (name === '../services/email') return emailModule;
      if (name === '../privacy') return { publicEmail: (_encrypted: string, email: string) => email };
      if (name === '../services/eventNotificationTiming') return { easternEventStart, eventStartDue };
      if (name === '../lib/server/notifications/notificationService') return {
        sendLeagueNotification: async () => ({ sent: 0 }),
        sendTournamentNotification: async () => ({ sent: 0 }),
        sendNotificationToUser: async () => ({ sent: 0, attempted: 0, skipped: 1 }),
      };
      throw new Error(`Unexpected scheduled job dependency: ${name}`);
    },
  });
  const run = async (secret = 'fixture-job-secret') => {
    let status = 200;
    let body: Record<string, unknown> = {};
    const response = { status(value: number) { status = value; return response; }, json(value: typeof body) { body = value; } };
    await handlers.get('/hourly-event-notifications')!({ header: () => secret, query: {} }, response);
    return { status, body };
  };
  return { run, reads, emails, deliveries };
}
