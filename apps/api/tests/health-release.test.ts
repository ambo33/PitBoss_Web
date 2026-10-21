import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('health exposes only healthy state and the non-secret Render release identifier', () => {
  const source = readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8');
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression) && statement.expression.arguments[0]?.getText(ast) === "'/healthz'");
  assert(node && ts.isExpressionStatement(node) && ts.isCallExpression(node.expression));
  const handler = node.expression.arguments[1];
  for (const release of [undefined, '0123456789abcdef0123456789abcdef01234567']) {
    let result: Record<string, unknown> = {};
    const code = `(${handler.getText(ast)})(null, { json: save });`;
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
      process: { env: { RENDER_GIT_COMMIT: release, JWT_SECRET: 'never-expose-fixture' } },
      save: (value: typeof result) => { result = value; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.release, release);
    assert.equal(JSON.stringify(result).includes('never-expose-fixture'), false);
    assert.equal(Object.keys(result).length, release ? 2 : 1);
  }
});
