import { loadDatabaseConfig } from '../config/env.js';
import { runMigrations } from './migrate.js';
import { createPgPool } from './postgres.js';

async function main() {
  const { databaseUrl } = loadDatabaseConfig();
  const pool = createPgPool(databaseUrl);

  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`Applied migrations: ${applied.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration failed');
  process.exitCode = 1;
});
