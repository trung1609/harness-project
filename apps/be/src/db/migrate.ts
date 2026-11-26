import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const DEFAULT_MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

const MIGRATION_LOCK_ID = 728_391_04;

/**
 * Applies all pending SQL migrations in lexical order inside per-file transactions.
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  const lockClient = await pool.connect();
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await lockClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const appliedResult = await lockClient.query<{ version: string }>(
      'SELECT version FROM schema_migrations',
    );
    const applied = new Set(appliedResult.rows.map((row) => row.version));

    const newlyApplied: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), 'utf8');
      try {
        await lockClient.query('BEGIN');
        await lockClient.query(sql);
        await lockClient.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file],
        );
        await lockClient.query('COMMIT');
        newlyApplied.push(file);
      } catch (error) {
        await lockClient.query('ROLLBACK');
        throw error;
      }
    }

    return newlyApplied;
  } finally {
    await lockClient
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
      .catch(() => {});
    lockClient.release();
  }
}
