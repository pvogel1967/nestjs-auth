// Prints a version's README changelog entry as GitHub release notes, so the
// changelog stays the single source. Fails if the version has no entry.
// Usage: node scripts/release-notes.mjs v0.10.1
import { readFileSync } from 'node:fs';

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const heading = new RegExp(`^#### ${version.replaceAll('.', '\\.')}( .*)?$`, 'm');
const match = heading.exec(readme);
if (!match) {
  console.error(`README.md's changelog has no entry for ${version}; add one before releasing.`);
  process.exit(1);
}

const entry = readme.slice(match.index + match[0].length);
const next = entry.search(/^#{1,4} /m);
// Release pages don't resolve the README's relative links, so point them at the repo at this tag.
const repoAtTag = `https://github.com/pvogel1967/nestjs-auth/blob/v${version}`;
const notes = (next === -1 ? entry : entry.slice(0, next))
  .trim()
  .replace(/\]\(#([^)]+)\)/g, `](${repoAtTag}/README.md#$1)`)
  .replace(/\]\((?!https?:|#)([^)]+)\)/g, `](${repoAtTag}/$1)`);
console.log(`${notes}\n\nnpm: https://www.npmjs.com/package/@pvogel/nestjs-auth/v/${version}`);
