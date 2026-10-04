// The root package is `"type": "module"`; this marks the CJS build as CommonJS
// so Node and TypeScript load dist/cjs/*.js and *.d.ts in the right format.
import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist/cjs/package.json', import.meta.url), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
