const assert = require('node:assert/strict');
const { test } = require('node:test');
const lib = require('@pvogel/nestjs-auth');
const { runModuleTests } = require('./module.cjs');
const { runScenario, startApp } = require('./scenario.cjs');

const nest = { common: require('@nestjs/common'), core: require('@nestjs/core') };

test('require() resolves the CommonJS build', () => {
  assert.match(require.resolve('@pvogel/nestjs-auth'), /dist\/cjs\/index\.js$/);
});

test('CommonJS build against NestJS', t => runScenario(t, nest, lib));
test('CommonJS build through AuthxModule', t => runScenario(t, nest, lib, { wiring: 'module' }));
test('AuthxModule on the CommonJS build', t => runModuleTests(t, nest, lib));

test('CommonJS interceptor accepts bills from the ESM build', async t => {
  const esm = await import('@pvogel/nestjs-auth');
  assert.notEqual(esm.IdentifiedBill, lib.IdentifiedBill);
  await runScenario(t, nest, lib, { billLib: esm });
});

test('denials are logged through the injected logger', async t => {
  const entries = [];
  const logger = {
    trace: (message, fields) => entries.push({ level: 'trace', message, fields }),
    debug: (message, fields) => entries.push({ level: 'debug', message, fields }),
  };
  const { app, get } = await startApp(nest, lib, { logger });
  t.after(() => app.close());

  assert.equal((await get('/workouts/1', 'limited')).status, 403);
  assert.deepEqual(entries.at(-1), {
    level: 'debug',
    message: 'Request failed to validate scopes against grants.',
    fields: { scopes: ['workouts/1/view'], grants: ['me/view'] },
  });
});
