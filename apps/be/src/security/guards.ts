import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccountRecord } from '../accounts/accounts.repository.js';
import { SessionService } from '../auth/session.service.js';
import {
  ForbiddenAppException,
  UnauthorizedAppException,
} from '../common/exceptions/domain-exceptions.js';
import { parseCookieHeader, verifyCsrfToken } from './csrf.js';

export const ACCESS_COOKIE_NAME = 'access_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';
export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_GUARD_SECRET = Symbol('CSRF_GUARD_SECRET');
export const ROLES_METADATA_KEY = 'required_roles';

export type AccountRole = AccountRecord['role'];

export const Roles = (...roles: AccountRole[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);

export interface AuthenticatedRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  auth?: {
    sessionId: string;
    account: AccountRecord;
  };
}

function getSingleHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Verifies the HTTP-only access cookie against Redis and current PostgreSQL account state.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = parseCookieHeader(getSingleHeader(req.headers, 'cookie'));
    const accessCredential = cookies[ACCESS_COOKIE_NAME];

    try {
      req.auth = await this.sessionService.authenticate(accessCredential);
      return true;
    } catch {
      throw new UnauthorizedAppException('Authentication required');
    }
  }
}

/**
 * Enforces double-submit signed CSRF verification on cookie-authenticated state-changing requests.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  constructor(@Inject(CSRF_GUARD_SECRET) private readonly csrfSecret: string) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (CsrfGuard.SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    if (!req.auth) {
      throw new UnauthorizedAppException('Authentication required');
    }

    const cookies = parseCookieHeader(getSingleHeader(req.headers, 'cookie'));
    const cookieToken = cookies[CSRF_COOKIE_NAME];
    const headerToken = getSingleHeader(req.headers, CSRF_HEADER_NAME);

    if (
      !cookieToken ||
      !headerToken ||
      cookieToken !== headerToken ||
      !verifyCsrfToken(headerToken, req.auth.sessionId, this.csrfSecret)
    ) {
      throw new ForbiddenAppException('Invalid CSRF token', 'CSRF_INVALID');
    }

    return true;
  }
}

/**
 * Enforces role-based authorization declared via @Roles(...) metadata.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AccountRole[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.auth) {
      throw new UnauthorizedAppException('Authentication required');
    }

    if (!requiredRoles.includes(req.auth.account.role)) {
      throw new ForbiddenAppException('Insufficient permissions');
    }

    return true;
  }
}
