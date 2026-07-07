import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const run = (script, args = []) => {
  const result = spawnSync('npm', ['run', script, '--workspace=talesofbudapest-backend', ...args], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

console.log('Step 1/3: Database migrations (audio_url column + storage bucket)...');
run('db:migrate');

console.log('\nStep 2/3: Seed landmarks...');
run('seed');

console.log('\nStep 3/3: Generate audio for all landmarks...');
run('generate:audio:all');

console.log('\nSetup complete.');
