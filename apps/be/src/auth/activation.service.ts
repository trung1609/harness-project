import type { Redis } from 'ioredis';
import type {
  AccountRecord,
  AccountsRepository,
} from '../accounts/accounts.repository.js';
import type { ActivationMailerService } from '../mail/mail.service.js';
import {
  consumeActivationToken,
  DEFAULT_ACTIVATION_TTL_SECONDS,
  issueActivationToken,
} from './activation-tokens.js';
import { hashPassword, verifyPassword } from './password.js';

export class InvalidOrExpiredActivationTokenError extends Error {
  constructor() {
    super('Activation link is invalid or expired');
    this.name = 'InvalidOrExpiredActivationTokenError';
  }
}

export class AccountPendingActivationError extends Error {
  constructor() {
    super('Account is pending activation');
    this.name = 'AccountPendingActivationError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountLockedError extends Error {
  constructor() {
    super('Account is locked');
    this.name = 'AccountLockedError';
  }
}

/**
 * Coordinates registration, single-use activation, resend, and activation-aware credential checks.
 */
export class ActivationService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly redis: Redis,
    private readonly mailer: ActivationMailerService,
    private readonly buildActivationUrl: (token: string) => string,
    private readonly tokenTtlSeconds: number = DEFAULT_ACTIVATION_TTL_SECONDS,
  ) {}

  async register(
    email: string,
    password: string,
  ): Promise<{ accountId: string; status: 'pending'; delivered: boolean }> {
    const passwordHash = await hashPassword(password);
    const account = await this.accounts.createPendingAccount(
      email,
      passwordHash,
    );
    const token = await issueActivationToken(
      this.redis,
      account.id,
      this.tokenTtlSeconds,
    );
    const delivery = await this.mailer.sendOrQueueActivation(
      account.id,
      account.email,
      this.buildActivationUrl(token),
    );

    return {
      accountId: account.id,
      status: 'pending',
      delivered: delivery.delivered,
    };
  }

  async activate(rawToken: string): Promise<{ status: 'activated'; accountId: string }> {
    const accountId = await consumeActivationToken(this.redis, rawToken);
    if (!accountId) {
      throw new InvalidOrExpiredActivationTokenError();
    }

    const updated = await this.accounts.markActivated(accountId);
    if (!updated) {
      throw new InvalidOrExpiredActivationTokenError();
    }

    return { status: 'activated', accountId: updated.id };
  }

  async resendActivation(email: string): Promise<{ status: 'accepted' }> {
    const account = await this.accounts.findByEmail(email);
    if (account && account.activatedAt === null) {
      const token = await issueActivationToken(
        this.redis,
        account.id,
        this.tokenTtlSeconds,
      );
      await this.mailer.sendOrQueueActivation(
        account.id,
        account.email,
        this.buildActivationUrl(token),
      );
    }
    return { status: 'accepted' };
  }

  async verifyCredentialsForSignIn(
    email: string,
    password: string,
  ): Promise<AccountRecord> {
    const account = await this.accounts.findByEmail(email);
    if (!account) {
      throw new InvalidCredentialsError();
    }

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    if (account.activatedAt === null) {
      throw new AccountPendingActivationError();
    }

    if (account.lockedAt !== null) {
      throw new AccountLockedError();
    }

    return account;
  }
}
