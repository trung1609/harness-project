import type {
  AccountRecord,
  AccountsRepository,
} from '../accounts/accounts.repository.js';
import { createCsrfToken } from '../security/csrf.js';
import type { ActivationService } from './activation.service.js';
import type { IssuedSession, RedisSessionStore } from './session-store.js';

export class UnauthorizedSessionError extends Error {
  constructor() {
    super('Authentication is required or session has expired');
    this.name = 'UnauthorizedSessionError';
  }
}

export interface SessionBundle {
  session: IssuedSession;
  csrfToken: string;
  account: Pick<AccountRecord, 'id' | 'email' | 'role'>;
}

export interface AuthenticatedContext {
  sessionId: string;
  account: AccountRecord;
}

/**
 * Coordinates sign-in, access verification, atomic refresh rotation, and logout.
 */
export class SessionService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly activationService: ActivationService,
    private readonly sessionStore: RedisSessionStore,
    private readonly csrfSecret: string,
  ) {}

  async signIn(
    email: string,
    password: string,
    nowMs: number = Date.now(),
  ): Promise<SessionBundle> {
    const account = await this.activationService.verifyCredentialsForSignIn(
      email,
      password,
    );
    const session = await this.sessionStore.createSession(
      { id: account.id, sessionGeneration: account.sessionGeneration },
      nowMs,
    );
    const csrfToken = createCsrfToken(session.sessionId, this.csrfSecret);

    return {
      session,
      csrfToken,
      account: { id: account.id, email: account.email, role: account.role },
    };
  }

  async authenticate(
    rawAccessCredential: string | undefined,
    nowMs: number = Date.now(),
  ): Promise<AuthenticatedContext> {
    const verified = await this.sessionStore.authenticateAccess(
      rawAccessCredential,
      nowMs,
    );
    if (!verified) {
      throw new UnauthorizedSessionError();
    }

    const account = await this.accounts.findById(verified.userInfo.id);
    if (
      !account ||
      account.activatedAt === null ||
      account.lockedAt !== null ||
      account.sessionGeneration !== verified.userInfo.sessionGeneration
    ) {
      throw new UnauthorizedSessionError();
    }

    return { sessionId: verified.sessionId, account };
  }

  async refresh(
    rawRefreshCredential: string | undefined,
    nowMs: number = Date.now(),
  ): Promise<SessionBundle> {
    const rotated = await this.sessionStore.rotateRefresh(
      rawRefreshCredential,
      nowMs,
    );
    if (!rotated) {
      throw new UnauthorizedSessionError();
    }

    const account = await this.accounts.findById(rotated.userInfo.id);
    if (
      !account ||
      account.activatedAt === null ||
      account.lockedAt !== null ||
      account.sessionGeneration !== rotated.userInfo.sessionGeneration
    ) {
      await this.sessionStore.deleteSession(rotated.sessionId);
      throw new UnauthorizedSessionError();
    }

    const csrfToken = createCsrfToken(rotated.sessionId, this.csrfSecret);
    return {
      session: rotated,
      csrfToken,
      account: { id: account.id, email: account.email, role: account.role },
    };
  }

  async logout(
    sessionId: string,
    rawAccessCredential?: string,
    nowMs: number = Date.now(),
  ): Promise<void> {
    await this.sessionStore.deleteSession(
      sessionId,
      rawAccessCredential,
      nowMs,
    );
  }

  parseRefreshSessionId(rawRefreshCredential: string | undefined): string | null {
    return this.sessionStore.parseJwt(rawRefreshCredential, 'refresh')?.sid ?? null;
  }
}
