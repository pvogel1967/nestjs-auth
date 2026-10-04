// Runs the shared scenario against one matrix project (NEST_MATRIX_DIR): its
// NestJS major and its installed copy of the packed tarball, both builds.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.env.NEST_MATRIX_DIR);
// nestNN tests the latest NN.x; nestNN.N.N pins an exact release, e.g. the supported floor
const [, majorText, pinned] = /nest(\d+)((?:\.\d+){2})?$/.exec(dir);
const expectedMajor = Number(majorText);
const expectedVersion = pinned ? `${majorText}${pinned}` : undefined;
const projectRequire = createRequire(join(dir, 'package.json'));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

// NestJS 12's exports map hides package.json, so walk up from the entry point.
function packageJsonOf(require, name) {
  let current = dirname(realpathSync(require.resolve(name)));
  while (!existsSync(join(current, 'package.json')) || readJson(join(current, 'package.json')).name !== name) {
    current = dirname(current);
  }
  return join(current, 'package.json');
}

const nest = { common: projectRequire('@nestjs/common'), core: projectRequire('@nestjs/core') };
const libPackageJson = projectRequire.resolve('@pvogel/nestjs-auth/package.json');
const cjs = projectRequire('@pvogel/nestjs-auth');
const esm = await import(
  pathToFileURL(join(dirname(libPackageJson), readJson(libPackageJson).exports['.'].import.default)).href
);
const { runModuleTests } = createRequire(import.meta.url)('../module.cjs');
const { runScenario } = createRequire(import.meta.url)('../scenario.cjs');

test(`library resolves the project's NestJS ${expectedMajor}`, () => {
  const common = packageJsonOf(projectRequire, '@nestjs/common');
  const { version } = readJson(common);
  assert.equal(Number(version.split('.')[0]), expectedMajor);
  if (expectedVersion) {
    assert.equal(version, expectedVersion);
  }
  // the installed library must load this same copy, not the repo's dev dependency
  assert.equal(packageJsonOf(createRequire(libPackageJson), '@nestjs/common'), common);
});

test(`CommonJS build on NestJS ${expectedMajor}`, t => runScenario(t, nest, cjs));
test(`ESM build on NestJS ${expectedMajor}`, t => runScenario(t, nest, esm));
test(`ESM interceptor with CommonJS bills on NestJS ${expectedMajor}`, t =>
  runScenario(t, nest, esm, { billLib: cjs }));
test(`CommonJS build through AuthxModule on NestJS ${expectedMajor}`, t => runScenario(t, nest, cjs, { wiring: 'module' }));
test(`ESM build through AuthxModule on NestJS ${expectedMajor}`, t => runScenario(t, nest, esm, { wiring: 'module' }));
test(`AuthxModule checks on NestJS ${expectedMajor} (CommonJS)`, t => runModuleTests(t, nest, cjs));
test(`AuthxModule checks on NestJS ${expectedMajor} (ESM)`, t => runModuleTests(t, nest, esm));
