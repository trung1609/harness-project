import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { getVercelHandler } from '../../dist/vercel.js';
import { verifyRestoredDatabase } from '../../dist/ops/verify-restore.js';
import { retryPendingNotifications } from '../../dist/ops/retry-notifications.js';

test(
  'Vercel serverless handler initializes NestJS once and serves /api/v1/health',
  { timeout: 10_000 },
  async () => {
    const handler = await getVercelHandler({ logger: false });
    const server = http.createServer((req, res) => {
      void handler(req, res);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const first = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
      assert.equal(first.status, 200);
      assert.deepEqual(await first.json(), { status: 'ok' });

      const second = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
      assert.equal(second.status, 200);
      assert.deepEqual(await second.json(), { status: 'ok' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test('verifyRestoredDatabase validates migrations and reports table counts', async () => {
  const mockPool = {
    async query(sql) {
      if (sql.includes('FROM schema_migrations')) {
        return { rows: [{ version: '001_initial_schema.sql' }] };
      }
      if (sql.includes('FROM accounts')) return { rows: [{ count: '2' }] };
      if (sql.includes('FROM notes')) return { rows: [{ count: '3' }] };
      if (sql.includes('FROM tasks')) return { rows: [{ count: '4' }] };
      if (sql.includes('FROM task_notes')) return { rows: [{ count: '1' }] };
      if (sql.includes('FROM support_requests')) return { rows: [{ count: '1' }] };
      if (sql.includes('FROM support_evidence')) {
        return { rows: [{ count: '1', valid_refs: '1' }] };
      }
      if (sql.includes('FROM notification_jobs')) return { rows: [{ count: '2' }] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const report = await verifyRestoredDatabase(mockPool);
  assert.deepEqual(report, {
    migrations: ['001_initial_schema.sql'],
    counts: {
      accounts: 2,
      notes: 3,
      tasks: 4,
      taskNotes: 1,
      supportRequests: 1,
      supportEvidence: 1,
      supportEvidenceWithValidRefs: 1,
      notificationJobs: 2,
    },
  });
});

test('verifyRestoredDatabase rejects an empty migration history', async () => {
  const emptyPool = {
    async query(sql) {
      if (sql.includes('FROM schema_migrations')) {
        return { rows: [] };
      }
      return { rows: [{ count: '0', valid_refs: '0' }] };
    },
  };

  await assert.rejects(
    () => verifyRestoredDatabase(emptyPool),
    /No applied migrations found/u,
  );
});

test('retryPendingNotifications aggregates activation and support retry results', async () => {
  const activationMailer = {
    async retryPendingActivationJobs() {
      return { sent: 2, cancelled: 1, failed: 0 };
    },
  };
  const supportMailer = {
    async retryPendingSupportJobs() {
      return { sent: 1, failed: 1 };
    },
  };

  const summary = await retryPendingNotifications(
    activationMailer,
    supportMailer,
    new Date('2026-11-26T12:00:00Z'),
  );
  assert.deepEqual(summary, {
    activation: { sent: 2, cancelled: 1, failed: 0 },
    support: { sent: 1, failed: 1 },
  });
});
