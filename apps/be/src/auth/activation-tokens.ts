import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';

export const DEFAULT_ACTIVATION_TTL_SECONDS = 30 * 60;

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function tokenKey(tokenHash: string): string {
  return `activation:token:${tokenHash}`;
}

function accountKey(accountId: string): string {
  return `activation:account:${accountId}`;
}

/**
 * Issues a single-use opaque activation token in Redis, replacing any previous token for the account.
 */
export async function issueActivationToken(
  redis: Redis,
  accountId: string,
  ttlSeconds: number = DEFAULT_ACTIVATION_TTL_SECONDS,
): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');
  const verifier = hashToken(rawToken);
  const accKey = accountKey(accountId);

  const previousVerifier = await redis.get(accKey);
  const multi = redis.multi();
  if (previousVerifier) {
    multi.del(tokenKey(previousVerifier));
  }
  multi.set(tokenKey(verifier), accountId, 'EX', ttlSeconds);
  multi.set(accKey, verifier, 'EX', ttlSeconds);
  await multi.exec();

  return rawToken;
}

/**
 * Atomically consumes a single-use activation token and returns its bound account ID, or null if invalid/expired.
 */
export async function consumeActivationToken(
  redis: Redis,
  rawToken: string,
): Promise<string | null> {
  if (!rawToken) {
    return null;
  }

  const verifier = hashToken(rawToken);
  const key = tokenKey(verifier);
  const accountId = await redis.getdel(key);
  if (!accountId) {
    return null;
  }

  const accKey = accountKey(accountId);
  const currentVerifier = await redis.get(accKey);
  if (currentVerifier === verifier) {
    await redis.del(accKey);
  }

  return accountId;
}
