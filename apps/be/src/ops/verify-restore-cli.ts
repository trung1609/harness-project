import { createPgPool } from '../db/postgres.js';
import { verifyRestoredDatabase } from './verify-restore.js';

function resolveDatabaseUrl(argv: string[]): string {
  const flagIndex = argv.indexOf('--database-url');
  const fromFlag =
    flagIndex >= 0 && flagIndex + 1 < argv.length
      ? argv[flagIndex + 1]?.trim()
      : undefined;
  const url = fromFlag || process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL or --database-url <url> is required');
  }
  return url;
}

async function main() {
  const databaseUrl = resolveDatabaseUrl(process.argv.slice(2));
  const pool = createPgPool(databaseUrl);

  try {
    const report = await verifyRestoredDatabase(pool);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Restore verification failed',
  );
  process.exitCode = 1;
});
