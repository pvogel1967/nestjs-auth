// Packs the library, installs the tarball into each test/matrix/nestNN project,
// then type-checks test/matrix/consumer.ts and runs the HTTP scenario there.
// Usage: node scripts/test-matrix.mjs [nest10.0.0 nest10 nest11 ...]
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const matrixDir = 'test/matrix';
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

const projects = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(matrixDir).filter(name => /^nest\d+(\.\d+\.\d+)?$/.test(name)).sort();

run('pnpm', ['pack', '--out', '.matrix/pvogel-nestjs-auth.tgz']);

for (const project of projects) {
  const dir = join(matrixDir, project);
  console.log(`\n=== ${project} ===`);
  // --force re-extracts the tarball, which keeps the same path between runs
  run('pnpm', ['install', '--force', '--reporter=silent'], { cwd: dir });
  copyFileSync(join(matrixDir, 'consumer.ts'), join(dir, 'consumer.ts'));
  run('node_modules/.bin/tsc', ['-p', dir]);
  run('node', ['--test', '--test-reporter=spec', join(matrixDir, 'compat.test.mjs')], {
    env: { ...process.env, NEST_MATRIX_DIR: dir },
  });
}
