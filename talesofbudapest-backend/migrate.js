import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const migrationFiles = [
  '001_alter_only.sql',
  '002_storage.sql',
  '003_locations_name_unique.sql',
  '004_landmark_images.sql',
  '005_storage_landmark_images.sql',
  '006_narratives.sql',
  '007_narrative_writes.sql',
  '008_rag_history.sql',
];

const runMigration = async () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL is not set in talesofbudapest-backend/.env');
    console.error('');
    console.error('How to get it:');
    console.error('  1. Supabase Dashboard → your project → Project Settings → Database');
    console.error('  2. Under "Connection string", choose URI');
    console.error('  3. Copy the Session pooler string (port 6543) and replace [YOUR-PASSWORD]');
    console.error('  4. Add to .env: DATABASE_URL=postgresql://postgres....');
    console.error('');
    console.error('Then run from repo root: npm run db:migrate');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Running ${file}...`);
      await client.query(sql);
      console.log(`  ${file} complete`);
    }

    console.log('All migrations complete');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
};

runMigration();
