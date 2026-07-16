import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filename = 'boq-lint-v0.1.0.html';
const input = resolve('release', filename);
const output = resolve('release', `${filename}.sha256`);
const digest = createHash('sha256')
  .update(await readFile(input))
  .digest('hex');

await writeFile(output, `${digest}  ${filename}\n`, 'utf8');
