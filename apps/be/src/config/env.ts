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

export interface ProviderConfig {
  appBaseUrl: string;
  csrfSecret: string;
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

/**
 * Reads and validates server-side security, Cloudinary, and Gmail SMTP credentials.
 */
export function loadProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig {
  const portRaw = env.SMTP_PORT?.trim() || '465';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SMTP_PORT must be a valid TCP port');
  }

  return {
    appBaseUrl: env.APP_BASE_URL?.trim() || 'http://localhost:3000',
    csrfSecret: requireEnv(env, 'CSRF_SECRET'),
    cloudinary: {
      cloudName: requireEnv(env, 'CLOUDINARY_CLOUD_NAME'),
      apiKey: requireEnv(env, 'CLOUDINARY_API_KEY'),
      apiSecret: requireEnv(env, 'CLOUDINARY_API_SECRET'),
    },
    smtp: {
      host: env.SMTP_HOST?.trim() || 'smtp.gmail.com',
      port,
      user: requireEnv(env, 'SMTP_USER'),
      pass: requireEnv(env, 'SMTP_PASS'),
      from: requireEnv(env, 'MAIL_FROM'),
    },
  };
}
