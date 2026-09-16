import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { easternEventStart, eventStartDue } from '../src/services/eventNotificationTiming';

type StartRecipient = {
  entityid: string; userid: string; emailaddress: string; emailencrypted: string;
  name: string; containername: string; eventdate: string; eventtime: string;
  url: string; leagueid: string | null; emailallowed: boolean; pushallowed: boolean;
};

function loadJob(tournaments: StartRecipient[], leagues: StartRecipient[]) {
  const handlers = new Map<string, (req: unknown, res: { json: (body: unknown) => void }) => Promise<void>>();
  const claimed = new Set<string>();
  const emails: Array<{ to: string; kind: string; name: string }> = [];
  const pushes: Array<{ userid: string; type: string; data: Record<string, unknown> }> = [];
  const source = readFileSync(path.join(__dirname, '../src/routes/jobs.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const emailModule = {
    sendEventStartEmail: async (to: string, details: { kind: string; name: string }) => {
      emails.push({ to, kind: details.kind, name: details.name });
    },
    sendEventRecapEmail: async () => {},
    sendEventLobbyReminderEmail: async () => {},
    sendEventTodayReminderEmail: async () => {},
    sendLeagueEventReminderEmail: async () => {},
    sendRsvpReminderEmail: async () => {},
    sendTournamentReminderEmail: async () => {},
  };
  vm.runInNewContext(compiled, {
    exports: {},
    process: { env: { JOB_SECRET: 'synthetic-job-secret' } },
    Date: class extends Date {
      constructor(value?: string | number) { super(value ?? '2026-09-16T23:00:00Z'); }
    },
    Intl,
    Promise,
    console,
    require: (name: string) => {
      if (name === 'express') return { Router: () => ({
        post: (url: string, handler: (req: unknown, res: { json: (body: unknown) => void }) => Promise<void>) => handlers.set(url, handler),
      }) };
      if (name === '../db') return {
        query: async (sql: string) => {
          if (sql.includes('NULL::UUID AS leagueid')) return tournaments;
          if (sql.includes('COALESCE(lm.emailalertsenabled, TRUE) AS emailallowed')) return leagues;
          return [];
        },
        queryOne: async (sql: string, params: string[]) => {
          if (!sql.includes('INSERT INTO scheduleddeliveries')) return null;
          const key = params.join('|');
          if (claimed.has(key)) return null;
          claimed.add(key);
          return { deliveryid: `claim-${claimed.size}` };
        },
      };
      if (name === '../services/email') return emailModule;
      if (name === '../privacy') return { publicEmail: (_encrypted: string, email: string) => email };
      if (name === '../services/eventNotificationTiming') return { easternEventStart, eventStartDue };
      if (name === '../lib/server/notifications/notificationService') return {
        sendLeagueNotification: async () => ({ sent: 0 }),
        sendTournamentNotification: async () => ({ sent: 0 }),
        sendNotificationToUser: async (userid: string, type: string, data: Record<string, unknown>) => {
          pushes.push({ userid, type, data });
          return { attempted: 1, sent: 1, skipped: 0 };
        },
      };
      throw new Error(`Unexpected job dependency: ${name}`);
    },
  }, { filename: 'jobs.ts' });
  const handler = handlers.get('/hourly-event-notifications');
  assert.ok(handler);
  const run = async () => {
    let response: unknown;
    await handler({ header: () => 'synthetic-job-secret', query: {} }, { json: (body) => { response = body; } });
    return response as {
      eventStart: {
        tournaments: { due: number; emailSent: number; pushSent: number };
        leagues: { due: number; emailSent: number; pushSent: number };
      };
    };
  };
  return { run, emails, pushes };
}

function recipient(entityid: string, kind: 'tournament' | 'league'): StartRecipient {
  return {
    entityid, userid: `${entityid}-player`, emailaddress: `${entityid}@example.invalid`,
    emailencrypted: 'synthetic-ciphertext', name: `${kind} event`, containername: 'Test club',
    eventdate: '2026-09-16', eventtime: '19:00',
    url: kind === 'league' ? `/league/test-league/event/${entityid}` : `/lobby/${entityid}`,
    leagueid: kind === 'league' ? 'test-league' : null,
    emailallowed: true, pushallowed: true,
  };
}

test('the scheduled job sends both channels once to registered players at event start', async () => {
  const job = loadJob([recipient('tournament-1', 'tournament')], [recipient('league-1', 'league')]);
  const first = await job.run();
  assert.equal(first.eventStart.tournaments.emailSent, 1);
  assert.equal(first.eventStart.tournaments.pushSent, 1);
  assert.equal(first.eventStart.leagues.emailSent, 1);
  assert.equal(first.eventStart.leagues.pushSent, 1);
  assert.equal(job.emails.length, 2);
  assert.deepEqual(job.emails.map((email) => email.kind).sort(), ['league', 'tournament']);
  assert.equal(job.pushes.find((push) => push.type === 'season_milestone')?.data.body,
    'Your league event is starting. Record your finish when you are knocked out.');
  const second = await job.run();
  assert.equal(second.eventStart.tournaments.emailSent, 0);
  assert.equal(second.eventStart.leagues.pushSent, 0);
  assert.equal(job.emails.length, 2);
  assert.equal(job.pushes.length, 2);
});

test('start delivery honors separate email and push opt-outs and skips future events', async () => {
  const noEmail = { ...recipient('tournament-2', 'tournament'), emailallowed: false };
  const noPush = { ...recipient('league-2', 'league'), pushallowed: false };
  const future = { ...recipient('league-3', 'league'), eventtime: '20:00' };
  const job = loadJob([noEmail], [noPush, future]);
  const result = await job.run();
  assert.equal(result.eventStart.tournaments.due, 1);
  assert.equal(result.eventStart.leagues.due, 1);
  assert.equal(job.emails.length, 1);
  assert.equal(job.emails[0].to, noPush.emailaddress);
  assert.equal(job.pushes.length, 1);
  assert.equal(job.pushes[0].userid, noEmail.userid);
});
