import type { Pool } from 'pg';

export interface QueryablePool {
  query: Pool['query'];
}

export interface RestoreVerificationReport {
  migrations: string[];
  counts: {
    accounts: number;
    notes: number;
    tasks: number;
    taskNotes: number;
    supportRequests: number;
    supportEvidence: number;
    supportEvidenceWithValidRefs: number;
    notificationJobs: number;
  };
}

async function countTable(pool: QueryablePool, table: string): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${table}`,
  );
  return Number(res.rows[0]?.count ?? '0');
}

/**
 * Verifies that a restored PostgreSQL database has applied migrations and intact core tables.
 */
export async function verifyRestoredDatabase(
  pool: QueryablePool,
): Promise<RestoreVerificationReport> {
  const migrationsRes = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const migrations = migrationsRes.rows.map((row) => row.version);
  if (migrations.length === 0) {
    throw new Error('No applied migrations found in schema_migrations');
  }

  const evidenceRes = await pool.query<{ count: string; valid_refs: string }>(
    `SELECT
       COUNT(*)::text AS count,
       COUNT(*) FILTER (
         WHERE length(trim(public_id)) > 0 AND length(trim(image_url)) > 0
       )::text AS valid_refs
     FROM support_evidence`,
  );

  const supportEvidence = Number(evidenceRes.rows[0]?.count ?? '0');
  const supportEvidenceWithValidRefs = Number(
    evidenceRes.rows[0]?.valid_refs ?? '0',
  );
  if (supportEvidence !== supportEvidenceWithValidRefs) {
    throw new Error(
      'Restored support_evidence contains rows missing public_id or image_url',
    );
  }

  return {
    migrations,
    counts: {
      accounts: await countTable(pool, 'accounts'),
      notes: await countTable(pool, 'notes'),
      tasks: await countTable(pool, 'tasks'),
      taskNotes: await countTable(pool, 'task_notes'),
      supportRequests: await countTable(pool, 'support_requests'),
      supportEvidence,
      supportEvidenceWithValidRefs,
      notificationJobs: await countTable(pool, 'notification_jobs'),
    },
  };
}
