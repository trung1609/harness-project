export interface ActivationRetryRunner {
  retryPendingActivationJobs(
    now?: Date,
    limit?: number,
  ): Promise<{ sent: number; cancelled: number; failed: number }>;
}

export interface SupportRetryRunner {
  retryPendingSupportJobs(
    now?: Date,
    limit?: number,
  ): Promise<{ sent: number; failed: number }>;
}

export interface NotificationRetrySummary {
  activation: { sent: number; cancelled: number; failed: number };
  support: { sent: number; failed: number };
}

/**
 * Retries due activation and support/unlock notification jobs in bounded batches.
 */
export async function retryPendingNotifications(
  activationMailer: ActivationRetryRunner,
  supportMailer: SupportRetryRunner,
  now: Date = new Date(),
  limit: number = 20,
): Promise<NotificationRetrySummary> {
  const activation = await activationMailer.retryPendingActivationJobs(
    now,
    limit,
  );
  const support = await supportMailer.retryPendingSupportJobs(now, limit);
  return { activation, support };
}
