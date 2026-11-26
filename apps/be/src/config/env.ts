export interface DatabaseConfig {
  databaseUrl: string;
  redisUrl: string;
}

/**
 * Reads and validates required database and Redis connection URLs from the environment.
 */
export function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required');
  }

  return { databaseUrl, redisUrl };
}
