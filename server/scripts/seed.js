import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClient } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const client = await getClient();
  try {
    // Guard: skip seeding if data already present
    const check = await client.query('SELECT COUNT(*)::int AS c FROM lessons');
    if (check.rows[0].c > 0) {
      console.log('Seed skipped: lessons already present.');
      client.release();
      return;
    }

    await client.query('BEGIN');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '002_seed.sql'), 'utf8');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Seed complete.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Seed error:', e);
    process.exit(1);
  } finally {
    // ensure release if not early returned
  }
}

main();
