import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outFile = resolve('test/.tmp/daily-note.test.mjs');
await mkdir(dirname(outFile), { recursive: true });

await build({
  entryPoints: ['test/daily-note.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  logLevel: 'silent',
});

await import(pathToFileURL(outFile).href);
