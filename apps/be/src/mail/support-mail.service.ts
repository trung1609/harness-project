import type { Pool } from 'pg';

export interface SupportMailSender {
  sendSupportNotification(
    to: string,
    subject: string,
    body: string,
  ): Promise<void>;
}

interface PendingSupportJobRow {
  id: string;
  event_id: string;
  notification_type: string;
  account_id: string | null;
  support_request_id: string | null;
  attempt_count: number;
  email: string | null;
}

const DEFAULT_SUPPORT_RETRY_MS = 60_000;

/**
 * Delivers support/unlock decision notifications recorded in PostgreSQL with retry tracking.
 */
export class SupportMailerService {
  constructor(
    private readonly pool: Pool,
    private readonly mailSender: SupportMailSender,
    private readonly retryDelayMs: number = DEFAULT_SUPPORT_RETRY_MS,
  ) {}

  async deliverJob(
    jobId: string,
    recipientEmail: string,
    subject: string,
    body: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    try {
      await this.mailSender.sendSupportNotification(
        recipientEmail,
        subject,
        body,
      );
      await this.pool.query(
        `UPDATE notification_jobs
         SET status = 'SENT', attempt_count = attempt_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [jobId],
      );
      return true;
    } catch {
      const nextAttempt = new Date(now.getTime() + this.retryDelayMs);
      await this.pool.query(
        `UPDATE notification_jobs
         SET status = 'PENDING',
             attempt_count = attempt_count + 1,
             next_attempt_at = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [jobId, nextAttempt],
      );
      return false;
    }
  }

  async retryPendingSupportJobs(
    now: Date = new Date(),
    limit: number = 20,
  ): Promise<{ sent: number; failed: number }> {
    const res = await this.pool.query<PendingSupportJobRow>(
      `SELECT nj.id, nj.event_id, nj.notification_type, nj.account_id,
              nj.support_request_id, nj.attempt_count, a.email
       FROM notification_jobs nj
       LEFT JOIN accounts a ON a.id = nj.account_id
       WHERE nj.notification_type IN ('SUPPORT_DECISION', 'UNLOCK_APPROVED')
         AND nj.status = 'PENDING'
         AND nj.next_attempt_at <= $1
       ORDER BY nj.next_attempt_at ASC
       LIMIT $2`,
      [now, limit],
    );

    let sent = 0;
    let failed = 0;

    for (const job of res.rows) {
      if (!job.email) {
        continue;
      }
      const subject =
        job.notification_type === 'UNLOCK_APPROVED'
          ? 'Your account has been unlocked'
          : 'Update on your support request';
      const body = `Reference: ${job.support_request_id ?? job.id}`;

      const ok = await this.deliverJob(job.id, job.email, subject, body, now);
      if (ok) {
        sent += 1;
      } else {
        failed += 1;
      }
    }

    return { sent, failed };
  }
}
