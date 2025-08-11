import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClient } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id serial PRIMARY KEY,
      name text UNIQUE NOT NULL,
      run_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function main() {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const { rows } = await client.query(`SELECT 1 FROM _migrations WHERE name=$1`, [file]);
      if (rows.length) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log('Running migration', file);
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
    }

    await client.query('COMMIT');
    console.log('Migrations complete.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration error:', e);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();
