import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

type Email = { to: string; subject: string; html: string };

// Load the real email service with isolated DB/provider stubs. Never load local
// credentials, connect to a database, or send an actual email from this test.
function loadEmailService(enabled: boolean, provider: 'smtp' | 'resend') {
  const delivered: Email[] = [];
  const dependencies: Record<string, unknown> = {
    nodemailer: {
      createTransport: () => ({ sendMail: async (email: Email) => { delivered.push(email); } }),
    },
    https: {
      request: (_options: unknown, onResponse: (response: EventEmitter & { statusCode: number; setEncoding: () => void }) => void) => {
        let body = '';
        return {
          on: () => {},
          write: (chunk: string) => { body += chunk; },
          end: () => {
            delivered.push(JSON.parse(body));
            const response = Object.assign(new EventEmitter(), { statusCode: 200, setEncoding: () => {} });
            onResponse(response);
            response.emit('end');
          },
        };
      },
    },
    crypto: { randomBytes: () => { throw new Error('Unexpected token creation'); } },
    '../config': { getAppUrl: () => 'https://poker.example.invalid' },
    '../privacy': { hashEmail: () => 'synthetic-email-hash' },
    '../db': {
      queryOne: async () => ({ userid: 'test-user', emailalertsenabled: enabled, emailunsubscribetoken: 'test-opt-out-token' }),
      query: async () => { throw new Error('Unexpected database write'); },
    },
  };
  const source = readFileSync(path.join(__dirname, '../src/services/email.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: {
    sendLeagueBoardPostEmail?: (...args: string[]) => Promise<void>;
    sendEventStartEmail?: (email: string, details: { kind: 'league' | 'tournament'; name: string; when: string; url: string }) => Promise<void>;
  } = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id: string) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
    process: { env: provider === 'resend' ? { RESEND_API_KEY: 'synthetic-test-key' } : {} },
    Buffer,
    console,
  }, { filename: 'email.ts' });
  assert.ok(exports.sendLeagueBoardPostEmail && exports.sendEventStartEmail);
  return { send: exports.sendLeagueBoardPostEmail, sendStart: exports.sendEventStartEmail, delivered };
}

for (const provider of ['smtp', 'resend'] as const) {
  test(`league-board email skips opted-out accounts (${provider})`, async () => {
    const { send, delivered } = loadEmailService(false, provider);
    await send('player@example.invalid', 'test-league', 'Test League', 'Test Season', 'Test Admin', 'Test update');
    assert.equal(delivered.length, 0, 'An opted-out account must not reach the email provider');
  });

  test(`league-board email still reaches opted-in accounts (${provider})`, async () => {
    const { send, delivered } = loadEmailService(true, provider);
    await send('player@example.invalid', 'test-league', 'Test League', 'Test Season', 'Test Admin', 'Test <update>');
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].to, 'player@example.invalid');
    assert.equal(delivered[0].subject, 'Test League: new Test Season update');
    assert.ok(delivered[0].html.includes('Test &lt;update&gt;'));
    assert.ok(delivered[0].html.includes('/unsubscribe/test-opt-out-token'));
  });

  test(`event-start email respects opt-out and links to the live league event (${provider})`, async () => {
    const details = {
      kind: 'league' as const,
      name: 'Event #2',
      when: '2026-09-16 at 7:00 PM',
      url: '/league/test-league/event/test-event',
    };
    const disabled = loadEmailService(false, provider);
    await disabled.sendStart('player@example.invalid', details);
    assert.equal(disabled.delivered.length, 0);

    const enabled = loadEmailService(true, provider);
    await enabled.sendStart('player@example.invalid', details);
    assert.equal(enabled.delivered.length, 1);
    assert.equal(enabled.delivered[0].subject, 'Event #2 is starting now');
    assert.ok(enabled.delivered[0].html.includes('When you are knocked out'));
    assert.ok(enabled.delivered[0].html.includes('href="https://poker.example.invalid/league/test-league/event/test-event"'));
  });
}
