import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as lib from '@pvogel/nestjs-auth';

const require = createRequire(import.meta.url);
const { runModuleTests } = require('./module.cjs');
const { runRejectionTests } = require('./rejections.cjs');
const { runScenario } = require('./scenario.cjs');
const nest = {
  common: require('@nestjs/common'),
  core: require('@nestjs/core'),
  fastify: require('@nestjs/platform-fastify'),
  rxjs: require('rxjs'),
};

test('import resolves the ESM build', () => {
  assert.match(import.meta.resolve('@pvogel/nestjs-auth'), /dist\/esm\/index\.js$/);
});

test('ESM build against NestJS', t => runScenario(t, nest, lib));
test('ESM build through AuthxModule', t => runScenario(t, nest, lib, { wiring: 'module' }));
test('AuthxModule on the ESM build', t => runModuleTests(t, nest, lib));
test('ESM build on Fastify', t => runScenario(t, nest, lib, { platform: 'fastify' }));
test('ESM build through AuthxModule on Fastify', t => runScenario(t, nest, lib, { wiring: 'module', platform: 'fastify' }));
test('rejections on Express (ESM build)', t => runRejectionTests(t, nest, lib, 'express'));
test('rejections on Fastify (ESM build)', t => runRejectionTests(t, nest, lib, 'fastify'));

test('ESM interceptor accepts bills from the CommonJS build', async t => {
  const cjs = require('@pvogel/nestjs-auth');
  assert.notEqual(cjs.IdentifiedBill, lib.IdentifiedBill);
  await runScenario(t, nest, lib, { billLib: cjs });
});
