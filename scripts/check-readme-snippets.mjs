// The README's quick start embeds files from example/ verbatim, so the two
// describe one app. Fails when a snippet labelled `// example/<path>` no longer
// matches that file.
import { readFileSync } from 'node:fs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const snippets = [...readme.matchAll(/```ts\n\/\/ (example\/\S+)\n([\s\S]*?)\n```/g)];
if (snippets.length === 0) {
  console.error('README.md has no `// example/...` snippets to check.');
  process.exit(1);
}

const stale = snippets.filter(([, path, body]) => {
  const file = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\n+$/, '');
  return body !== file;
});
for (const [, path] of stale) {
  console.error(`README.md's snippet of ${path} no longer matches the file; copy the file into the README.`);
}
if (stale.length > 0) {
  process.exit(1);
}
console.log(`README.md snippets match example/ (${snippets.length} files).`);
