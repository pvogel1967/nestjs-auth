import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as lib from '@pvogel/nestjs-auth';

const require = createRequire(import.meta.url);
const { runModuleTests } = require('./module.cjs');
const { runScenario } = require('./scenario.cjs');
const nest = { common: require('@nestjs/common'), core: require('@nestjs/core') };

test('import resolves the ESM build', () => {
  assert.match(import.meta.resolve('@pvogel/nestjs-auth'), /dist\/esm\/index\.js$/);
});

test('ESM build against NestJS', t => runScenario(t, nest, lib));
test('ESM build through AuthxModule', t => runScenario(t, nest, lib, { wiring: 'module' }));
test('AuthxModule on the ESM build', t => runModuleTests(t, nest, lib));

test('ESM interceptor accepts bills from the CommonJS build', async t => {
  const cjs = require('@pvogel/nestjs-auth');
  assert.notEqual(cjs.IdentifiedBill, lib.IdentifiedBill);
  await runScenario(t, nest, lib, { billLib: cjs });
});
