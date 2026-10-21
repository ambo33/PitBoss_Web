import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadKnockoutDetails } from './helpers/knockout-notification-harness';
import { buildNotificationPayload } from '../src/lib/server/notifications/templates';

// Run the actual post-mutation notification statements only. No knockout write,
// real push transport, user account, or live database is used in these checks.
function dispatchSource(kind: 'admin' | 'self') {
  const source = readFileSync(path.join(__dirname, `../src/routes/${kind === 'admin' ? 'players' : 'public'}.ts`), 'utf8');
  const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
  const routePath = kind === 'admin' ? '/:tid/players/:uid/knock' : '/tournaments/:id/knockout/self';
  const statement = ast.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.arguments[0]?.getText(ast) === `'${routePath}'`);
  assert(statement && ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression));
  const handler = statement.expression.arguments[statement.expression.arguments.length - 1];
  assert(ts.isArrowFunction(handler) && ts.isBlock(handler.body));
  if (kind === 'admin') {
    const dispatch = handler.body.statements.find(node => ts.isIfStatement(node) && node.expression.getText(ast) === 'nextPlaced != null');
    assert(dispatch);
    return dispatch.getText(ast);
  }
  const start = handler.body.statements.findIndex(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'linkedLeagueEvent'));
  assert(start >= 0);
  return handler.body.statements.slice(start, -1).map(node => node.getText(ast)).join('\n');
}

async function dispatch(kind: 'admin' | 'self', linked: boolean, credit: boolean, activecount = 3) {
  const pushes: Array<{ type: string; data: Record<string, unknown>; options: Record<string, unknown> }> = [];
  const details = loadKnockoutDetails(async () => ({
    payoutstructure: JSON.stringify({ mode: 'count', value: 3 }),
    buyin: 50, registeredcount: 10, enteredcount: 10, activecount,
  }));
  const code = ts.transpileModule(`(async () => { ${dispatchSource(kind)} })()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await vm.runInNewContext(code, {
    console, req: { params: { id: 't-1', tid: 't-1', uid: 'player-1' } },
    nextPlaced: 4, placed: 4, playerUserId: 'player-1',
    creditedKnockoutByUserId: credit ? 'credit-1' : null,
    knockedoutByUserId: credit ? 'credit-1' : null,
    notifyLinkedLeagueKnockout: async () => linked,
    queryOne: async (sql: string) => {
      assert.match(sql.trim(), /^SELECT/);
      return { playername: 'Alex', bountyamount: 0, bountyclaimedbyuserid: null };
    },
    knockoutNotificationDetails: details.knockoutNotificationDetails,
    sendTournamentNotification: async (_id: string, type: string, data: Record<string, unknown>, options: Record<string, unknown>) => {
      pushes.push({ type, data, options });
    },
  });
  return pushes;
}

for (const kind of ['admin', 'self'] as const) {
  test(`${kind} knockout sends placement and next-payout details to the existing participant/admin audience`, async () => {
    const pushes = await dispatch(kind, false, true);
    assert.equal(pushes.length, 2);
    const broadcast = pushes.find(push => push.options.audience === 'participants-and-admins');
    assert(broadcast);
    assert.equal(broadcast.data.body, 'Alex was knocked out in 4th place. Next knockout payout: $100.');
    assert.equal(broadcast.data.placed, 4);
    assert.equal(broadcast.data.nextPaidPlace, 3);
    assert.equal(broadcast.data.nextPayout, 100);
    assert.equal(broadcast.data.tag, 'tournament-t-1-knockout-player-1');
    const credit = pushes.find(push => push.options.targetUserIds);
    assert(credit);
    assert.deepEqual([...credit.options.targetUserIds as string[]], ['credit-1']);
    assert.equal(credit.data.body, 'You knocked out Alex in 4th place. Next knockout payout: $100.');
    const payload = buildNotificationPayload('knockout_recorded', { tournamentId: 't-1', ...broadcast.data });
    assert.equal(payload.url, '/lobby/t-1');
    assert.equal(payload.body, broadcast.data.body);
  });

  test(`${kind} league-linked knockout does not bypass league preferences with a duplicate tournament broadcast`, async () => {
    const noCredit = await dispatch(kind, true, false);
    assert.equal(noCredit.length, 0);
    const credit = await dispatch(kind, true, true);
    assert.equal(credit.length, 1);
    assert.equal(credit[0].options.audience, undefined);
    assert.equal(credit[0].data.placed, 4);
    assert.match(String(credit[0].data.body), /Next knockout payout: \$100/);
  });

  test(`${kind} knockout outside the money retains placement but no payout claim`, async () => {
    const [push] = await dispatch(kind, false, false, 4);
    assert.equal(push.data.body, 'Alex was knocked out in 4th place.');
    assert.equal(push.data.nextPaidPlace, undefined);
  });
}
