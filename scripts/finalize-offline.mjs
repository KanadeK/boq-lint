import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('.offline-dist/index.html');
const target = resolve('release/boq-lint-v0.1.0.html');

await mkdir(dirname(target), { recursive: true });
const html = await readFile(source, 'utf8');
const normalized = html.replace(/=`\t(?=\r?\n)/gu, '=`\\t');
await writeFile(target, normalized, 'utf8');
await rm(resolve('.offline-dist'), { recursive: true, force: true });
