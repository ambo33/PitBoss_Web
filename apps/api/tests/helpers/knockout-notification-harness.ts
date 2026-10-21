import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import type * as DetailsModule from '../../src/services/knockoutNotificationDetails';

// Execute the real formatter/payout code with an isolated, read-only DB adapter.
export function loadKnockoutDetails(queryOne: (sql: string, params: unknown[]) => Promise<unknown>) {
  const exports = {} as typeof DetailsModule;
  const errors: unknown[][] = [];
  const source = readFileSync(path.join(__dirname, '../../src/services/knockoutNotificationDetails.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Intl, console: { error: (...args: unknown[]) => errors.push(args) },
    require: (name: string) => {
      if (name === '../db') return { queryOne };
      throw new Error(`Unexpected knockout dependency: ${name}`);
    },
  });
  return { ...exports, errors };
}
