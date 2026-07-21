#!/usr/bin/env node
/**
 * Thin wrapper kept for older docs/commands.
 * Prefer: node cli/seed-frozen-gold-split.js --name test|probe ...
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [path.join(__dirname, 'seed-frozen-gold-split.js'), '--name', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
