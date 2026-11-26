import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import {
  DEFAULT_ACTIVATION_TTL_SECONDS,
  issueActivationToken,
} from '../auth/activation-tokens.js';

export interface MailSender {
  sendActivationEmail(to: string, activationUrl: string): Promise<void>;
}

export interface NotificationJobRow {
  id: string;
  event_id: string;
  notification_type: string;
  account_id: string | null;
  status: string;
  attempt_count: number;
  next_attempt_at: Date;
}

const DEFAULT_RETRY_DELAY_MS = 60_000;

/**
 * Handles activation email delivery with PostgreSQL-backed retry tracking.
 */
export class ActivationMailerService {
  constructor(
    private readonly pool: Pool,
    private readonly redis: Redis,
    private readonly accounts: AccountsRepository,
    private readonly mailSender: MailSender,
    private readonly buildActivationUrl: (token: string) => string,
    private readonly tokenTtlSeconds: number = DEFAULT_ACTIVATION_TTL_SECONDS,
    private readonly retryDelayMs: number = DEFAULT_RETRY_DELAY_MS,
  ) {}

  async sendOrQueueActivation(
    accountId: string,
    email: string,
    activationUrl: string,
    now: Date = new Date(),
  ): Promise<{ delivered: boolean; jobId: string }> {
    const jobId = randomUUID();
    const eventId = `activation:${jobId}`;

    await this.pool.query(
      `INSERT INTO notification_jobs
         (id, event_id, notification_type, account_id, status, attempt_count, next_attempt_at)
       VALUES ($1, $2, 'ACCOUNT_ACTIVATION', $3, 'PENDING', 1, $4)`,
      [jobId, eventId, accountId, now],
    );

    try {
      await this.mailSender.sendActivationEmail(email, activationUrl);
      await this.pool.query(
        `UPDATE notification_jobs
         SET status = 'SENT', updated_at = NOW()
         WHERE id = $1`,
        [jobId],
      );
      return { delivered: true, jobId };
    } catch {
      const nextAttempt = new Date(now.getTime() + this.retryDelayMs);
      await this.pool.query(
        `UPDATE notification_jobs
         SET status = 'PENDING', next_attempt_at = $2, updated_at = NOW()
         WHERE id = $1`,
        [jobId, nextAttempt],
      );
      return { delivered: false, jobId };
    }
  }

  /**
   * Retries due pending activation jobs, issuing a fresh link if the account is still pending.
   */
  async retryPendingActivationJobs(
    now: Date = new Date(),
    limit: number = 20,
  ): Promise<{ sent: number; cancelled: number; failed: number }> {
    const due = await this.pool.query<NotificationJobRow>(
      `SELECT id, event_id, notification_type, account_id, status, attempt_count, next_attempt_at
       FROM notification_jobs
       WHERE notification_type = 'ACCOUNT_ACTIVATION'
         AND status = 'PENDING'
         AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC
       LIMIT $2`,
      [now, limit],
    );

    let sent = 0;
    let cancelled = 0;
    let failed = 0;

    for (const job of due.rows) {
      if (!job.account_id) {
        await this.markCancelled(job.id);
        cancelled += 1;
        continue;
      }

      const account = await this.accounts.findById(job.account_id);
      if (!account || account.activatedAt !== null) {
        await this.markCancelled(job.id);
        cancelled += 1;
        continue;
      }

      const freshToken = await issueActivationToken(
        this.redis,
        account.id,
        this.tokenTtlSeconds,
      );
      const freshUrl = this.buildActivationUrl(freshToken);

      try {
        await this.mailSender.sendActivationEmail(account.email, freshUrl);
        await this.pool.query(
          `UPDATE notification_jobs
           SET status = 'SENT', attempt_count = attempt_count + 1, updated_at = NOW()
           WHERE id = $1`,
          [job.id],
        );
        sent += 1;
      } catch {
        const nextAttempt = new Date(now.getTime() + this.retryDelayMs);
        await this.pool.query(
          `UPDATE notification_jobs
           SET attempt_count = attempt_count + 1, next_attempt_at = $2, updated_at = NOW()
           WHERE id = $1`,
          [job.id, nextAttempt],
        );
        failed += 1;
      }
    }

    return { sent, cancelled, failed };
  }

  private async markCancelled(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_jobs
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1`,
      [jobId],
    );
  }
}
