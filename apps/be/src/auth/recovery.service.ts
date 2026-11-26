import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import { hashPassword, verifyPassword } from './password.js';

const TOKEN_TTL_SECONDS = 30 * 60;

export interface RecoveryMailSender {
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
  sendUnlockVerificationEmail(to: string, unlockUrl: string): Promise<void>;
}

export class InvalidOrExpiredRecoveryTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrExpiredRecoveryTokenError';
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor() {
    super('Current password is incorrect');
    this.name = 'InvalidCurrentPasswordError';
  }
}

export class EmailDeliveryFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryFailedError';
  }
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

async function issueSingleUseToken(
  redis: Redis,
  prefix: string,
  accountId: string,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await redis.set(
    `${prefix}:${hashToken(token)}`,
    accountId,
    'EX',
    TOKEN_TTL_SECONDS,
  );
  return token;
}

async function consumeSingleUseToken(
  redis: Redis,
  prefix: string,
  rawToken: string,
): Promise<string | null> {
  const key = `${prefix}:${hashToken(rawToken)}`;
  return redis.getdel(key);
}

/**
 * Handles password changes, forgot-password email resets, and locked-account unlock verification links.
 */
export class AccountRecoveryService {
  constructor(
    private readonly pool: Pool,
    private readonly redis: Redis,
    private readonly accounts: AccountsRepository,
    private readonly mailSender: RecoveryMailSender,
    private readonly buildResetUrl: (token: string) => string,
    private readonly buildUnlockUrl: (token: string) => string,
  ) {}

  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new InvalidCurrentPasswordError();
    }

    const valid = await verifyPassword(currentPassword, account.passwordHash);
    if (!valid) {
      throw new InvalidCurrentPasswordError();
    }

    const nextHash = await hashPassword(newPassword);
    await this.accounts.updatePassword(account.id, nextHash, false);
  }

  async requestPasswordReset(email: string): Promise<{ status: 'accepted' }> {
    const account = await this.accounts.findByEmail(email);
    if (account && account.activatedAt !== null && account.lockedAt === null) {
      const token = await issueSingleUseToken(
        this.redis,
        'pwreset',
        account.id,
      );
      try {
        await this.mailSender.sendPasswordResetEmail(
          account.email,
          this.buildResetUrl(token),
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('550') || msg.toLowerCase().includes('daily user sending limit')) {
          throw new EmailDeliveryFailedError(
            'Tài khoản Gmail SMTP đã vượt giới hạn gửi email trong ngày. Vui lòng thử lại sau hoặc đổi SMTP_USER khác.',
          );
        }
        throw new EmailDeliveryFailedError(
          'Không thể gửi email đặt lại mật khẩu qua SMTP. Vui lòng thử lại sau.',
        );
      }
    }
    return { status: 'accepted' };
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const accountId = await consumeSingleUseToken(this.redis, 'pwreset', token);
    if (!accountId) {
      throw new InvalidOrExpiredRecoveryTokenError(
        'Password reset link is invalid or expired',
      );
    }

    const nextHash = await hashPassword(newPassword);
    await this.accounts.updatePassword(accountId, nextHash, true);
  }

  async requestUnlockVerification(
    email: string,
  ): Promise<{ status: 'accepted' }> {
    const account = await this.accounts.findByEmail(email);
    if (account && account.lockedAt !== null) {
      const token = await issueSingleUseToken(
        this.redis,
        'unlock',
        account.id,
      );
      try {
        await this.mailSender.sendUnlockVerificationEmail(
          account.email,
          this.buildUnlockUrl(token),
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('550') || msg.toLowerCase().includes('daily user sending limit')) {
          throw new EmailDeliveryFailedError(
            'Tài khoản Gmail SMTP đã vượt giới hạn gửi email trong ngày. Vui lòng thử lại sau hoặc đổi SMTP_USER khác.',
          );
        }
        throw new EmailDeliveryFailedError(
          'Không thể gửi email xác minh mở khóa qua SMTP. Vui lòng thử lại sau.',
        );
      }
    }
    return { status: 'accepted' };
  }

  async submitUnlockRequestWithToken(
    token: string,
    text: string,
  ): Promise<{ id: string; status: string }> {
    const accountId = await consumeSingleUseToken(this.redis, 'unlock', token);
    if (!accountId) {
      throw new InvalidOrExpiredRecoveryTokenError(
        'Unlock verification link is invalid or expired',
      );
    }

    const id = randomUUID();
    const res = await this.pool.query<{ id: string; status: string }>(
      `INSERT INTO support_requests (id, requester_id, type, request_text, status)
       VALUES ($1, $2, 'UNLOCK', $3, 'SUBMITTED')
       RETURNING id, status`,
      [id, accountId, text.trim()],
    );
    return res.rows[0];
  }
}
