import { Redis } from 'ioredis';

/**
 * Creates a Redis client for the given connection string.
 */
export function createRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
}
