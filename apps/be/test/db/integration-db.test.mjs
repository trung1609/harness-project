import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { createRedisClient } from '../../dist/db/redis.js';

const config = loadDatabaseConfig();

test('PostgreSQL migrations and schema constraints work on disposable database', async () => {
  const pool = createPgPool(config.databaseUrl);

  try {
    const firstRun = await runMigrations(pool);
    assert.ok(firstRun.includes('001_initial_schema.sql'));

    const secondRun = await runMigrations(pool);
    assert.deepEqual(secondRun, []);

    const ownerA = randomUUID();
    const ownerB = randomUUID();

    await pool.query(
      `INSERT INTO accounts (id, email, password_hash, role)
       VALUES ($1, $2, 'hash-a', 'USER'), ($3, $4, 'hash-b', 'USER')`,
      [ownerA, `a-${ownerA}@example.com`, ownerB, `b-${ownerB}@example.com`],
    );

    const seriesA = randomUUID();
    await pool.query(
      `INSERT INTO task_series (id, owner_id, series_month)
       VALUES ($1, $2, '2026-11-01')`,
      [seriesA, ownerA],
    );

    // Cross-owner series reference must be rejected
    await assert.rejects(
      pool.query(
        `INSERT INTO tasks (id, owner_id, series_id, title, scheduled_date, start_time, end_time)
         VALUES ($1, $2, $3, 'Cross-owner series', '2026-11-26', '09:00:00', '10:00:00')`,
        [randomUUID(), ownerB, seriesA],
      ),
      { code: '23503' },
    );

    // Invalid same-day slot (start_time >= end_time) must be rejected
    await assert.rejects(
      pool.query(
        `INSERT INTO tasks (id, owner_id, title, scheduled_date, start_time, end_time)
         VALUES ($1, $2, 'Overnight', '2026-11-26', '23:00:00', '01:00:00')`,
        [randomUUID(), ownerA],
      ),
      { code: '23514' },
    );

    // Valid series occurrence
    const taskA1 = randomUUID();
    await pool.query(
      `INSERT INTO tasks (id, owner_id, series_id, title, scheduled_date, start_time, end_time)
       VALUES ($1, $2, $3, 'Series 1', '2026-11-26', '09:00:00', '10:00:00')`,
      [taskA1, ownerA, seriesA],
    );

    // Duplicate (series_id, scheduled_date) must be rejected
    await assert.rejects(
      pool.query(
        `INSERT INTO tasks (id, owner_id, series_id, title, scheduled_date, start_time, end_time)
         VALUES ($1, $2, $3, 'Series dup', '2026-11-26', '11:00:00', '12:00:00')`,
        [randomUUID(), ownerA, seriesA],
      ),
      { code: '23505' },
    );

    // Overlapping standalone tasks on the same date are allowed
    await pool.query(
      `INSERT INTO tasks (id, owner_id, title, scheduled_date, start_time, end_time)
       VALUES ($1, $2, 'Overlap 1', '2026-11-26', '09:00:00', '10:30:00'),
              ($3, $2, 'Overlap 2', '2026-11-26', '09:30:00', '11:00:00')`,
      [randomUUID(), ownerA, randomUUID()],
    );

    // Cross-owner task_notes link must be rejected
    const noteB = randomUUID();
    await pool.query(
      `INSERT INTO notes (id, owner_id, title, body, starts_at)
       VALUES ($1, $2, 'Note B', 'Body', NOW())`,
      [noteB, ownerB],
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO task_notes (owner_id, task_id, note_id)
         VALUES ($1, $2, $3)`,
        [ownerA, taskA1, noteB],
      ),
      { code: '23503' },
    );
  } finally {
    await pool.end();
  }
});

test('Redis connectivity and TTL work on disposable instance', async () => {
  const redis = createRedisClient(config.redisUrl);

  try {
    await redis.connect();
    const pong = await redis.ping();
    assert.equal(pong, 'PONG');

    const key = `im02:ttl:${randomUUID()}`;
    await redis.set(key, 'ok', 'EX', 1);
    const immediate = await redis.get(key);
    assert.equal(immediate, 'ok');

    await delay(1200);
    const expired = await redis.get(key);
    assert.equal(expired, null);
  } finally {
    await redis.quit();
  }
});
