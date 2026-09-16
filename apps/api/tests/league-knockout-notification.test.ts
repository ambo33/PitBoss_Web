import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

type SentPush = { users: string[]; type: string; data: Record<string, unknown> };

function loadService(linked = true) {
  const pushes: SentPush[] = [];
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const source = readFileSync(path.join(__dirname, '../src/services/leagueKnockoutNotifications.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: {
    notifyLeagueKnockout?: (result: Record<string, unknown>) => Promise<void>;
    notifyLinkedLeagueKnockout?: (tournamentId: string, playerId: string, placed: number) => Promise<boolean>;
  } = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === '../db') return {
        queryOne: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return sql.includes('FROM leagueevents')
            ? linked ? { leagueid: 'league-1', seasonid: 'season-1', eventid: 'event-1', name: 'Event #2' } : null
            : { name: 'Alex' };
        },
        query: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return [{ userid: 'member-1' }, { userid: 'member-2' }];
        },
      };
      if (name === '../lib/server/notifications/notificationService') return {
        sendNotificationToUsers: async (users: string[], type: string, data: Record<string, unknown>) => {
          pushes.push({ users, type, data });
        },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  }, { filename: 'leagueKnockoutNotifications.ts' });
  assert.ok(exports.notifyLeagueKnockout && exports.notifyLinkedLeagueKnockout);
  return { notify: exports.notifyLeagueKnockout, notifyLinked: exports.notifyLinkedLeagueKnockout, pushes, calls };
}

const result = {
  leagueId: 'league-1', seasonId: 'season-1', eventId: 'event-1', eventName: 'Event #2',
  playerId: 'player-1', placed: 3, dnf: false,
};

test('a recorded league knockout reaches approved season members through its own push type', async () => {
  const { notify, pushes, calls } = loadService();
  await notify(result);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].type, 'league_knockout');
  assert.deepEqual([...pushes[0].users], ['member-1', 'member-2']);
  assert.equal(pushes[0].data.tag, 'league-league-1-event-event-1-knockout-player-1');
  assert.equal(pushes[0].data.url, '/league/league-1/event/event-1');
  assert.match(String(pushes[0].data.body), /Alex was knocked out/);
  const recipients = calls.find(({ sql }) => sql.includes('FROM leaguemembers'));
  assert.ok(recipients);
  assert.match(recipients.sql, /lm\.userid <> \$3/);
  assert.match(recipients.sql, /COALESCE\(lm\.pushalertsenabled, TRUE\) = TRUE/);
  assert.deepEqual([...recipients.params], ['league-1', 'season-1', 'player-1']);
});

test('DNF, unfinished and first-place records do not announce a knockout', async () => {
  const { notify, pushes, calls } = loadService();
  await notify({ ...result, placed: null });
  await notify({ ...result, placed: 1 });
  await notify({ ...result, dnf: true });
  assert.equal(pushes.length, 0);
  assert.equal(calls.length, 0);
});

test('linked tournament knockouts use the same league event tag; standalone games do not', async () => {
  const linked = loadService();
  assert.equal(await linked.notifyLinked('tournament-1', 'player-1', 3), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(linked.pushes.length, 1);
  const standalone = loadService(false);
  assert.equal(await standalone.notifyLinked('tournament-1', 'player-1', 3), false);
  assert.equal(standalone.pushes.length, 0);
});
