import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { AccountsRepository } from '../../dist/accounts/accounts.repository.js';
import {
  GoneAppException,
  NotFoundAppException,
  PayloadTooLargeAppException,
  UnsupportedMediaTypeAppException,
  ValidationAppException,
} from '../../dist/common/exceptions/domain-exceptions.js';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { SupportMailerService } from '../../dist/mail/support-mail.service.js';
import { MAX_EVIDENCE_BYTES } from '../../dist/media/cloudinary.adapter.js';
import { SupportRepository } from '../../dist/support/support.repository.js';
import { SupportService } from '../../dist/support/support.service.js';

const config = loadDatabaseConfig();

async function createAccount(pool, role = 'USER', locked = false) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, email, password_hash, role, activated_at, locked_at)
     VALUES ($1, $2, 'hash', $3, NOW(), $4)`,
    [id, `support-${id}@example.com`, role, locked ? new Date() : null],
  );
  return id;
}

test('AC-04, AC-12, AC-15, AC-17: evidence limits, intent checks, private viewing, unlock + mail retry, and cleanup', async () => {
  const pool = createPgPool(config.databaseUrl);

  try {
    await runMigrations(pool);
    const userA = await createAccount(pool, 'USER', false);
    const userB = await createAccount(pool, 'USER', false);
    const lockedUser = await createAccount(pool, 'USER', true);
    const admin = await createAccount(pool, 'ADMIN', false);

    const assets = new Map();
    const deletedAssets = [];
    const cloudinary = {
      async createSignedUploadParams(publicId, expiresAt) {
        return { publicId, expiresAt: expiresAt.toISOString(), signature: 'sig' };
      },
      async fetchAssetMetadata(publicId) {
        return assets.get(publicId) ?? null;
      },
      async createViewingUrl(publicId, expiresAt) {
        return `https://res.cloudinary.test/auth/${publicId}?exp=${expiresAt.getTime()}`;
      },
      async deleteAsset(publicId) {
        deletedAssets.push(publicId);
        assets.delete(publicId);
      },
    };

    let shouldFailMail = false;
    const sentMail = [];
    const mailSender = {
      async sendSupportNotification(to, subject, body) {
        if (shouldFailMail) {
          throw new Error('SMTP down');
        }
        sentMail.push({ to, subject, body });
      },
    };

    const accountsRepo = new AccountsRepository(pool);
    const supportRepo = new SupportRepository(pool);
    const mailer = new SupportMailerService(pool, mailSender, 0);
    const service = new SupportService(supportRepo, cloudinary, mailer);

    const t0 = new Date('2026-11-26T10:00:00Z');

    // 1. Lost upload finalization (missing asset) -> ValidationAppException
    const intentMissing = await service.createUploadIntent(
      userA,
      'SUPPORT_REQUEST',
      t0,
    );
    await assert.rejects(
      service.submitSupportRequest(
        userA,
        { kind: 'BUG_REPORT', text: 'Bug', intentId: intentMissing.intentId },
        t0,
      ),
      ValidationAppException,
    );

    // 2. Wrong intent owner -> NotFoundAppException
    await assert.rejects(
      service.submitSupportRequest(
        userB,
        { kind: 'BUG_REPORT', text: 'Hijack', intentId: intentMissing.intentId },
        t0,
      ),
      NotFoundAppException,
    );

    // 3. Unsupported format (415) and >10 MB (413)
    assets.set(intentMissing.publicId, {
      assetId: `asset-${randomUUID()}`,
      publicId: intentMissing.publicId,
      secureUrl: 'https://res.cloudinary.test/bad.gif',
      deliveryType: 'authenticated',
      format: 'gif',
      bytes: 1000,
    });
    await assert.rejects(
      service.submitSupportRequest(
        userA,
        { kind: 'BUG_REPORT', text: 'GIF', intentId: intentMissing.intentId },
        t0,
      ),
      UnsupportedMediaTypeAppException,
    );

    assets.set(intentMissing.publicId, {
      assetId: `asset-${randomUUID()}`,
      publicId: intentMissing.publicId,
      secureUrl: 'https://res.cloudinary.test/big.png',
      deliveryType: 'authenticated',
      format: 'png',
      bytes: MAX_EVIDENCE_BYTES + 1,
    });
    await assert.rejects(
      service.submitSupportRequest(
        userA,
        { kind: 'BUG_REPORT', text: 'Too big', intentId: intentMissing.intentId },
        t0,
      ),
      PayloadTooLargeAppException,
    );

    // 4. Exact 10,000,000-byte boundary succeeds and consumes intent (reuse fails with 410)
    assets.set(intentMissing.publicId, {
      assetId: `asset-${randomUUID()}`,
      publicId: intentMissing.publicId,
      secureUrl: 'https://res.cloudinary.test/ok.png',
      deliveryType: 'authenticated',
      format: 'png',
      bytes: MAX_EVIDENCE_BYTES,
    });
    const createdReq = await service.submitSupportRequest(
      userA,
      { kind: 'BUG_REPORT', text: 'Exact 10MB', intentId: intentMissing.intentId },
      t0,
    );
    assert.equal(createdReq.state, 'SUBMITTED');

    await assert.rejects(
      service.submitSupportRequest(
        userA,
        { kind: 'BUG_REPORT', text: 'Reuse', intentId: intentMissing.intentId },
        t0,
      ),
      GoneAppException,
    );

    // 5. Private viewing URL: unrelated user gets 404; owner and ADMIN succeed
    await assert.rejects(
      service.getEvidenceViewingUrl(userB, 'USER', createdReq.id, t0),
      NotFoundAppException,
    );
    const ownerView = await service.getEvidenceViewingUrl(
      userA,
      'USER',
      createdReq.id,
      t0,
    );
    const adminView = await service.getEvidenceViewingUrl(
      admin,
      'ADMIN',
      createdReq.id,
      t0,
    );
    assert.ok(ownerView.viewingUrl.includes(intentMissing.publicId));
    assert.ok(adminView.viewingUrl.includes(intentMissing.publicId));

    // 6. Expired intent -> 410, then cleanup deletes abandoned asset
    const expiredIntent = await service.createUploadIntent(
      userA,
      'SUPPORT_REQUEST',
      t0,
    );
    assets.set(expiredIntent.publicId, {
      assetId: `asset-${randomUUID()}`,
      publicId: expiredIntent.publicId,
      secureUrl: 'https://res.cloudinary.test/abandoned.webp',
      deliveryType: 'authenticated',
      format: 'webp',
      bytes: 500,
    });
    const afterExpiry = new Date(t0.getTime() + 15 * 60 * 1000);
    await assert.rejects(
      service.submitSupportRequest(
        userA,
        { kind: 'SUPPORT', text: 'Late', intentId: expiredIntent.intentId },
        afterExpiry,
      ),
      GoneAppException,
    );
    const cleaned = await service.cleanupAbandonedUploads(afterExpiry);
    assert.equal(cleaned, 1);
    assert.ok(deletedAssets.includes(expiredIntent.publicId));

    // 7. Unlock request + approval when mail fails -> account unlocked, job stays PENDING, retry delivers
    const unlockIntent = await service.createUploadIntent(
      lockedUser,
      'UNLOCK_REQUEST',
      t0,
    );
    assets.set(unlockIntent.publicId, {
      assetId: `asset-${randomUUID()}`,
      publicId: unlockIntent.publicId,
      secureUrl: 'https://res.cloudinary.test/unlock.jpg',
      deliveryType: 'authenticated',
      format: 'jpg',
      bytes: 2048,
    });
    const unlockReq = await service.submitUnlockRequest(
      lockedUser,
      { text: 'Please unlock my account', intentId: unlockIntent.intentId },
      t0,
    );

    shouldFailMail = true;
    const decisionRes = await service.recordDecision(
      unlockReq.id,
      'APPROVE_UNLOCK',
      t0,
    );
    assert.equal(decisionRes.request.state, 'RESOLVED');
    assert.equal(decisionRes.emailDelivered, false);

    const unlockedAcc = await accountsRepo.findById(lockedUser);
    assert.equal(unlockedAcc.lockedAt, null);

    shouldFailMail = false;
    const retryRes = await mailer.retryPendingSupportJobs(
      new Date(t0.getTime() + 1000),
    );
    assert.equal(retryRes.sent, 1);
    assert.equal(sentMail.length, 1);
  } finally {
    await pool.end();
  }
});
