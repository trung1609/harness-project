import { Pool } from 'pg';

/**
 * Creates a PostgreSQL connection pool for the given connection string.
 */
export function createPgPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
  });
}
