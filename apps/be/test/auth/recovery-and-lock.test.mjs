import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { URL } from 'node:url';
import { AccountsRepository } from '../../dist/accounts/accounts.repository.js';
import { hashPassword, verifyPassword } from '../../dist/auth/password.js';
import {
  AccountRecoveryService,
  InvalidCurrentPasswordError,
  InvalidOrExpiredRecoveryTokenError,
} from '../../dist/auth/recovery.service.js';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { createRedisClient } from '../../dist/db/redis.js';

const config = loadDatabaseConfig();

test('AccountRecoveryService & AccountsRepository handle lock reason, unlock link, change password, and forgot password', async () => {
  const pool = createPgPool(config.databaseUrl);
  const redis = createRedisClient(config.redisUrl);
  await runMigrations(pool);
  await redis.connect();

  const accounts = new AccountsRepository(pool);
  const sentEmails = [];
  const recovery = new AccountRecoveryService(
    pool,
    redis,
    accounts,
    {
      async sendPasswordResetEmail(to, resetUrl) {
        sentEmails.push({ type: 'reset', to, url: resetUrl });
      },
      async sendUnlockVerificationEmail(to, unlockUrl) {
        sentEmails.push({ type: 'unlock', to, url: unlockUrl });
      },
    },
    (token) => `https://example.test/reset-password?token=${token}`,
    (token) => `https://example.test/unlock?token=${token}`,
  );

  const email = `recovery-${randomUUID()}@example.com`;
  try {
    const initialHash = await hashPassword('12345678');
    const created = await accounts.createPendingAccount(email, initialHash);
    await accounts.markActivated(created.id);

    // 1. Change password validates currentPassword
    await assert.rejects(
      () => recovery.changePassword(created.id, 'wrongpass', 'newpass123'),
      InvalidCurrentPasswordError,
    );
    await recovery.changePassword(created.id, '12345678', 'newpass123');
    const afterChange = await accounts.findById(created.id);
    assert.ok(await verifyPassword('newpass123', afterChange.passwordHash));

    // 2. Forgot password sends reset link, consumes token once, and increments sessionGeneration
    await recovery.requestPasswordReset(email);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].type, 'reset');
    const resetToken = new URL(sentEmails[0].url).searchParams.get('token');
    assert.ok(resetToken);

    await recovery.confirmPasswordReset(resetToken, 'resetpass123');
    const afterReset = await accounts.findById(created.id);
    assert.ok(await verifyPassword('resetpass123', afterReset.passwordHash));
    assert.equal(afterReset.sessionGeneration, 1);

    await assert.rejects(
      () => recovery.confirmPasswordReset(resetToken, 'anotherpass'),
      InvalidOrExpiredRecoveryTokenError,
    );

    // 3. Lock account stores lockReason, unlock verification sends link, and token submits UNLOCK request
    const locked = await accounts.lockAccount(created.id, 'Spam activity');
    assert.ok(locked.lockedAt);
    assert.equal(locked.lockReason, 'Spam activity');

    await recovery.requestUnlockVerification(email);
    assert.equal(sentEmails.length, 2);
    assert.equal(sentEmails[1].type, 'unlock');
    const unlockToken = new URL(sentEmails[1].url).searchParams.get('token');
    assert.ok(unlockToken);

    const unlockReq = await recovery.submitUnlockRequestWithToken(
      unlockToken,
      'Tôi đã kiểm tra lại tài khoản.',
    );
    assert.equal(unlockReq.status, 'SUBMITTED');

    const unlocked = await accounts.unlockAccount(created.id);
    assert.equal(unlocked.lockedAt, null);
    assert.equal(unlocked.lockReason, null);
  } finally {
    await pool.query('DELETE FROM accounts WHERE email = $1', [email]);
    await redis.quit();
    await pool.end();
  }
});
