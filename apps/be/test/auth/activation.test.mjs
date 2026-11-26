import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { AccountsRepository } from '../../dist/accounts/accounts.repository.js';
import {
  AccountPendingActivationError,
  ActivationService,
  InvalidOrExpiredActivationTokenError,
} from '../../dist/auth/activation.service.js';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { createRedisClient } from '../../dist/db/redis.js';
import { ActivationMailerService } from '../../dist/mail/mail.service.js';

const config = loadDatabaseConfig();

function extractToken(url) {
  return new URL(url).searchParams.get('token');
}

test('AC-13: registration, single-use activation, expiry, resend, and retry with fresh link', async () => {
  const pool = createPgPool(config.databaseUrl);
  const redis = createRedisClient(config.redisUrl);

  try {
    await runMigrations(pool);
    await redis.connect();

    const accounts = new AccountsRepository(pool);
    const sentEmails = [];
    let shouldFailSend = false;

    const mailSender = {
      async sendActivationEmail(to, activationUrl) {
        if (shouldFailSend) {
          throw new Error('Simulated SMTP outage');
        }
        sentEmails.push({ to, activationUrl });
      },
    };

    const buildUrl = (token) => `https://example.test/activate?token=${token}`;
    const shortTtlSeconds = 1;
    const mailer = new ActivationMailerService(
      pool,
      redis,
      accounts,
      mailSender,
      buildUrl,
      shortTtlSeconds,
      0,
    );
    const service = new ActivationService(
      accounts,
      redis,
      mailer,
      buildUrl,
      shortTtlSeconds,
    );

    // 1. Register pending account; pending accounts cannot sign in
    const email1 = `pending-${randomUUID()}@example.com`;
    const reg1 = await service.register(email1, 'StrongPass123!');
    assert.equal(reg1.status, 'pending');
    assert.equal(reg1.delivered, true);
    assert.equal(sentEmails.length, 1);

    await assert.rejects(
      service.verifyCredentialsForSignIn(email1, 'StrongPass123!'),
      AccountPendingActivationError,
    );

    // 2. Resend replaces the old link; old link fails, new link activates once
    const resendAck = await service.resendActivation(email1);
    assert.deepEqual(resendAck, { status: 'accepted' });
    assert.equal(sentEmails.length, 2);

    const oldToken = extractToken(sentEmails[0].activationUrl);
    const newToken = extractToken(sentEmails[1].activationUrl);
    assert.notEqual(oldToken, newToken);

    await assert.rejects(
      service.activate(oldToken),
      InvalidOrExpiredActivationTokenError,
    );

    const activated = await service.activate(newToken);
    assert.equal(activated.status, 'activated');

    // Single-use: reusing the same link fails
    await assert.rejects(
      service.activate(newToken),
      InvalidOrExpiredActivationTokenError,
    );

    // Activated account can now sign in
    const verified = await service.verifyCredentialsForSignIn(
      email1,
      'StrongPass123!',
    );
    assert.equal(verified.id, reg1.accountId);

    // Resend for an already-active or unknown email returns generic ack without sending
    await service.resendActivation(email1);
    await service.resendActivation(`unknown-${randomUUID()}@example.com`);
    assert.equal(sentEmails.length, 2);

    // 3. Failed delivery + expired link -> retry issues a valid fresh link for pending account
    shouldFailSend = true;
    const email2 = `retry-${randomUUID()}@example.com`;
    const reg2 = await service.register(email2, 'RetryPass123!');
    assert.equal(reg2.delivered, false);

    // Wait for the 1s activation token to expire in Redis
    await delay(1200);

    shouldFailSend = false;
    const retryResult = await mailer.retryPendingActivationJobs(
      new Date(Date.now() + 5000),
    );
    assert.equal(retryResult.sent, 1);
    assert.equal(sentEmails.length, 3);

    const retriedToken = extractToken(sentEmails[2].activationUrl);
    const activated2 = await service.activate(retriedToken);
    assert.equal(activated2.accountId, reg2.accountId);
  } finally {
    await redis.quit();
    await pool.end();
  }
});
