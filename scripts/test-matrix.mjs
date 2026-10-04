// Packs the library, installs the tarball into each test/matrix project, then
// type-checks test/matrix/consumer.ts and runs the HTTP scenario there.
// Projects whose package.json names a yarn@ packageManager are installed and
// run with that Yarn (via corepack), under Plug'n'Play; the rest use pnpm.
// Usage: node scripts/test-matrix.mjs [nest10.0.0 nest10 nest11 nest12-yarn-berry ...]
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const matrixDir = 'test/matrix';
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

const projects = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(matrixDir).filter(name => /^nest\d+(\.\d+\.\d+)?(-[a-z-]+)?$/.test(name)).sort();

run('pnpm', ['pack', '--out', '.matrix/pvogel-nestjs-auth.tgz']);

for (const project of projects) {
  const dir = join(matrixDir, project);
  const { packageManager = '' } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  console.log(`\n=== ${project} ===`);
  copyFileSync(join(matrixDir, 'consumer.ts'), join(dir, 'consumer.ts'));
  const testArgs = ['--test', '--test-reporter=spec', resolve(matrixDir, 'compat.test.mjs')];

  if (packageManager.startsWith('yarn@')) {
    const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', NEST_MATRIX_DIR: resolve(dir) };
    // An empty lockfile marks this directory as its own Yarn project; dropping
    // the old one makes Yarn pick up the freshly packed tarball.
    rmSync(join(dir, 'yarn.lock'), { force: true });
    writeFileSync(join(dir, 'yarn.lock'), '');
    run('corepack', ['yarn', 'install'], { cwd: dir, env });
    // `yarn tsc` runs the project's own TypeScript, which Yarn patches for Plug'n'Play
    run('corepack', ['yarn', 'tsc', '-p', '.'], { cwd: dir, env });
    run('corepack', ['yarn', 'node', ...testArgs], { cwd: dir, env });
    continue;
  }

  // --force re-extracts the tarball, which keeps the same path between runs
  run('pnpm', ['install', '--force', '--reporter=silent'], { cwd: dir });
  run('node_modules/.bin/tsc', ['-p', dir]);
  run('node', testArgs, { env: { ...process.env, NEST_MATRIX_DIR: dir } });
}
