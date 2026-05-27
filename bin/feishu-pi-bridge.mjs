#!/usr/bin/env node
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(__dirname, '../dist/index.js'),
  join(__dirname, '../../dist/index.js'),
  join(process.cwd(), 'dist/index.js'),
];
for (const path of candidates) {
  if (existsSync(path)) {
    const { main } = await import(path);
    if (main) await main(process.argv.slice(2));
    process.exit(0);
  }
}
console.error('请先运行: npm run build');
process.exit(1);
