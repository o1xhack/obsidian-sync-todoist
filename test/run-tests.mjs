import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outFile = resolve('test/.tmp/all-tests.mjs');
await mkdir(dirname(outFile), { recursive: true });

await build({
  entryPoints: ['test/all-tests.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'obsidian-test-stub',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^obsidian$/ }, () => ({
          path: resolve('test/obsidian-stub.ts'),
        }));
      },
    },
  ],
  outfile: outFile,
  logLevel: 'silent',
});

await import(pathToFileURL(outFile).href);
