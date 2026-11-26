import { AccountsRepository } from '../accounts/accounts.repository.js';
import { loadDatabaseConfig } from '../config/env.js';
import { createPgPool } from '../db/postgres.js';
import { createRedisClient } from '../db/redis.js';
import { ActivationMailerService, type MailSender } from '../mail/mail.service.js';
import { SmtpMailSender } from '../mail/smtp-mail.sender.js';
import {
  SupportMailerService,
  type SupportMailSender,
} from '../mail/support-mail.service.js';
import { retryPendingNotifications } from './retry-notifications.js';

async function main() {
  const requireSmtp = process.argv.includes('--require-smtp');
  const { databaseUrl, redisUrl } = loadDatabaseConfig();
  const appBaseUrl =
    process.env.APP_BASE_URL?.trim() || 'http://localhost:3000';

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpPort = Number(process.env.SMTP_PORT?.trim() || '465');

  if (requireSmtp && (!smtpUser || !smtpPass)) {
    throw new Error('SMTP_USER and SMTP_PASS are required with --require-smtp');
  }

  const smtpSender =
    smtpUser && smtpPass
      ? new SmtpMailSender({
          host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
          port: Number.isInteger(smtpPort) ? smtpPort : 465,
          user: smtpUser,
          pass: smtpPass,
          from: process.env.MAIL_FROM?.trim() || smtpUser,
        })
      : null;

  const activationSender: MailSender = smtpSender ?? {
    async sendActivationEmail(to, activationUrl) {
      console.log(`[mail:dev] Activation retry for ${to}: ${activationUrl}`);
    },
  };
  const supportSender: SupportMailSender = smtpSender ?? {
    async sendSupportNotification(to, subject) {
      console.log(`[mail:dev] Support retry for ${to}: ${subject}`);
    },
  };

  const pool = createPgPool(databaseUrl);
  const redis = createRedisClient(redisUrl);

  try {
    const accountsRepo = new AccountsRepository(pool);
    const activationMailer = new ActivationMailerService(
      pool,
      redis,
      accountsRepo,
      activationSender,
      (token) => `${appBaseUrl}/activate?token=${encodeURIComponent(token)}`,
    );
    const supportMailer = new SupportMailerService(pool, supportSender);

    const summary = await retryPendingNotifications(
      activationMailer,
      supportMailer,
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await redis.quit().catch(() => {});
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Notification retry failed',
  );
  process.exitCode = 1;
});
