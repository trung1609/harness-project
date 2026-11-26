import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { EmailAlreadyRegisteredError } from '../accounts/accounts.repository.js';
import {
  AppException,
  ConflictAppException,
  ForbiddenAppException,
  GoneAppException,
  UnauthorizedAppException,
  ValidationAppException,
} from '../common/exceptions/domain-exceptions.js';
import {
  clearSessionCookies,
  setSessionCookies,
  type CookieResponse,
} from '../security/cookies.js';

interface CookieRequest {
  headers: Record<string, string | string[] | undefined> & {
    cookie?: string;
  };
}
import { parseCookieHeader, verifyCsrfToken } from '../security/csrf.js';
import {
  ACCESS_COOKIE_NAME,
  AuthGuard,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CsrfGuard,
  REFRESH_COOKIE_NAME,
  type AuthenticatedRequest,
} from '../security/guards.js';
import {
  AccountLockedError,
  AccountPendingActivationError,
  ActivationService,
  InvalidCredentialsError,
  InvalidOrExpiredActivationTokenError,
} from './activation.service.js';
import {
  AccountRecoveryService,
  EmailDeliveryFailedError,
  InvalidCurrentPasswordError,
  InvalidOrExpiredRecoveryTokenError,
} from './recovery.service.js';
import { SessionService, UnauthorizedSessionError } from './session.service.js';

export const CSRF_SECRET_TOKEN = Symbol('CSRF_SECRET_TOKEN');
export const COOKIE_SECURE_TOKEN = Symbol('COOKIE_SECURE_TOKEN');

interface SignInBody {
  email?: unknown;
  password?: unknown;
}

function extractRefreshAndCsrf(
  req: CookieRequest,
  csrfSecret: string,
  sessionService: SessionService,
): { refreshCredential: string; sessionId: string } {
  const cookies = parseCookieHeader(req.headers.cookie);
  const refreshCredential = cookies[REFRESH_COOKIE_NAME];
  if (!refreshCredential) {
    throw new UnauthorizedAppException('Refresh cookie is required');
  }

  const sessionId = sessionService.parseRefreshSessionId(refreshCredential);
  if (!sessionId) {
    throw new UnauthorizedAppException('Invalid refresh token');
  }

  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const rawHeader = req.headers[CSRF_HEADER_NAME];
  const csrfHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (
    !csrfCookie ||
    !csrfHeader ||
    csrfCookie !== csrfHeader ||
    !verifyCsrfToken(csrfHeader, sessionId, csrfSecret)
  ) {
    throw new ForbiddenAppException('Invalid CSRF token', 'CSRF_INVALID');
  }

  return { refreshCredential, sessionId };
}

/**
 * Thin HTTP controller for cookie-based session sign-in, refresh, and sign-out.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly activationService: ActivationService,
    private readonly sessionService: SessionService,
    @Inject(CSRF_SECRET_TOKEN) private readonly csrfSecret: string,
    @Inject(COOKIE_SECURE_TOKEN) private readonly secureCookies: boolean,
    @Optional() private readonly recoveryService?: AccountRecoveryService,
  ) {}

  @Post('registrations')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() body: SignInBody) {
    if (
      typeof body?.email !== 'string' ||
      typeof body?.password !== 'string' ||
      !body.email.trim() ||
      body.password.length < 8
    ) {
      throw new ValidationAppException(
        'Valid email and password (min 8 chars) are required',
        'INVALID_INPUT',
      );
    }

    try {
      return await this.activationService.register(body.email, body.password);
    } catch (error: unknown) {
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new ConflictAppException(error.message, 'EMAIL_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  @Post('activations')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activate(@Body() body: { token?: unknown }): Promise<void> {
    if (typeof body?.token !== 'string' || !body.token.trim()) {
      throw new ValidationAppException('token is required', 'INVALID_INPUT');
    }

    try {
      await this.activationService.activate(body.token);
    } catch (error: unknown) {
      if (error instanceof InvalidOrExpiredActivationTokenError) {
        throw new GoneAppException(error.message, 'ACTIVATION_TOKEN_EXPIRED');
      }
      throw error;
    }
  }

  @Post('activation-emails')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendActivation(@Body() body: { email?: unknown }) {
    if (typeof body?.email !== 'string' || !body.email.trim()) {
      throw new ValidationAppException('email is required', 'INVALID_INPUT');
    }
    return this.activationService.resendActivation(body.email);
  }

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() body: SignInBody,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    if (
      typeof body?.email !== 'string' ||
      typeof body?.password !== 'string' ||
      !body.email.trim() ||
      !body.password
    ) {
      throw new ValidationAppException('Email and password are required');
    }

    try {
      const bundle = await this.sessionService.signIn(
        body.email,
        body.password,
      );
      setSessionCookies(res, bundle, { secure: this.secureCookies });
      return { account: bundle.account };
    } catch (error: unknown) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedAppException(error.message, 'INVALID_CREDENTIALS');
      }
      if (error instanceof AccountPendingActivationError) {
        throw new ForbiddenAppException(error.message, 'ACCOUNT_PENDING');
      }
      if (error instanceof AccountLockedError) {
        throw new ForbiddenAppException(error.message, 'ACCOUNT_LOCKED');
      }
      throw error;
    }
  }

  @Post('session-refreshes')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refreshSession(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<void> {
    const { refreshCredential } = extractRefreshAndCsrf(
      req,
      this.csrfSecret,
      this.sessionService,
    );

    try {
      const bundle = await this.sessionService.refresh(refreshCredential);
      setSessionCookies(res, bundle, { secure: this.secureCookies });
    } catch (error: unknown) {
      if (error instanceof UnauthorizedSessionError) {
        clearSessionCookies(res, { secure: this.secureCookies });
        throw new UnauthorizedAppException(error.message);
      }
      throw error;
    }
  }

  @Delete('sessions/current')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<void> {
    const { sessionId } = extractRefreshAndCsrf(
      req,
      this.csrfSecret,
      this.sessionService,
    );
    const cookies = parseCookieHeader(req.headers.cookie);
    await this.sessionService.logout(sessionId, cookies[ACCESS_COOKIE_NAME]);
    clearSessionCookies(res, { secure: this.secureCookies });
  }

  @Post('password-changes')
  @UseGuards(AuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: { currentPassword?: unknown; newPassword?: unknown },
  ): Promise<void> {
    if (
      typeof body?.currentPassword !== 'string' ||
      typeof body?.newPassword !== 'string' ||
      !body.currentPassword ||
      body.newPassword.length < 8
    ) {
      throw new ValidationAppException(
        'currentPassword and newPassword (min 8 chars) are required',
        'INVALID_INPUT',
      );
    }

    try {
      await this.recoveryService!.changePassword(
        req.auth!.account.id,
        body.currentPassword,
        body.newPassword,
      );
    } catch (error: unknown) {
      if (error instanceof InvalidCurrentPasswordError) {
        throw new UnauthorizedAppException(error.message, 'INVALID_CREDENTIALS');
      }
      throw error;
    }
  }

  @Post('password-resets/requests')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(@Body() body: { email?: unknown }) {
    if (typeof body?.email !== 'string' || !body.email.trim()) {
      throw new ValidationAppException('email is required', 'INVALID_INPUT');
    }
    try {
      return await this.recoveryService!.requestPasswordReset(body.email);
    } catch (error: unknown) {
      if (error instanceof EmailDeliveryFailedError) {
        throw new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'EMAIL_DELIVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  @Post('password-resets/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body() body: { token?: unknown; newPassword?: unknown },
  ): Promise<void> {
    if (
      typeof body?.token !== 'string' ||
      !body.token.trim() ||
      typeof body?.newPassword !== 'string' ||
      body.newPassword.length < 8
    ) {
      throw new ValidationAppException(
        'token and newPassword (min 8 chars) are required',
        'INVALID_INPUT',
      );
    }

    try {
      await this.recoveryService!.confirmPasswordReset(
        body.token.trim(),
        body.newPassword,
      );
    } catch (error: unknown) {
      if (error instanceof InvalidOrExpiredRecoveryTokenError) {
        throw new GoneAppException(error.message, 'RESET_TOKEN_EXPIRED');
      }
      throw error;
    }
  }

  @Post('unlock-verification-emails')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestUnlockVerification(@Body() body: { email?: unknown }) {
    if (typeof body?.email !== 'string' || !body.email.trim()) {
      throw new ValidationAppException('email is required', 'INVALID_INPUT');
    }
    try {
      return await this.recoveryService!.requestUnlockVerification(body.email);
    } catch (error: unknown) {
      if (error instanceof EmailDeliveryFailedError) {
        throw new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'EMAIL_DELIVERY_FAILED',
          error.message,
        );
      }
      throw error;
    }
  }

  @Post('unlock-requests')
  @HttpCode(HttpStatus.CREATED)
  async submitUnlockRequestWithToken(
    @Body() body: { token?: unknown; text?: unknown },
  ) {
    if (
      typeof body?.token !== 'string' ||
      !body.token.trim() ||
      typeof body?.text !== 'string' ||
      !body.text.trim()
    ) {
      throw new ValidationAppException(
        'token and text are required',
        'INVALID_INPUT',
      );
    }

    try {
      return await this.recoveryService!.submitUnlockRequestWithToken(
        body.token.trim(),
        body.text,
      );
    } catch (error: unknown) {
      if (error instanceof InvalidOrExpiredRecoveryTokenError) {
        throw new GoneAppException(error.message, 'UNLOCK_TOKEN_EXPIRED');
      }
      throw error;
    }
  }
}
