import { runMigrations } from './migrate.js';
import { createPgPool } from './postgres.js';

async function main() {
  const ifEnv = process.argv.includes('--if-env');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    if (ifEnv) {
      console.log('Skipping migrations: DATABASE_URL is not set.');
      return;
    }
    throw new Error('DATABASE_URL is required');
  }

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
