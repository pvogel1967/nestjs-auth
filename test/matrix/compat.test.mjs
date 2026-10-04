// Runs the shared scenario against one matrix project (NEST_MATRIX_DIR): its
// NestJS major and its installed copy of the packed tarball, both builds.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.env.NEST_MATRIX_DIR);
const expectedMajor = Number(/nest(\d+)$/.exec(dir)[1]);
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
const { runScenario } = createRequire(import.meta.url)('../scenario.cjs');

test(`library resolves the project's NestJS ${expectedMajor}`, () => {
  const common = packageJsonOf(projectRequire, '@nestjs/common');
  assert.equal(Number(readJson(common).version.split('.')[0]), expectedMajor);
  // the installed library must load this same copy, not the repo's dev dependency
  assert.equal(packageJsonOf(createRequire(libPackageJson), '@nestjs/common'), common);
});

test(`CommonJS build on NestJS ${expectedMajor}`, t => runScenario(t, nest, cjs));
test(`ESM build on NestJS ${expectedMajor}`, t => runScenario(t, nest, esm));
test(`ESM interceptor with CommonJS bills on NestJS ${expectedMajor}`, t =>
  runScenario(t, nest, esm, { billLib: cjs }));
