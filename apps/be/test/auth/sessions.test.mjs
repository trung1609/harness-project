import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { URL } from 'node:url';
import { Reflector } from '@nestjs/core';
import {
  ForbiddenAppException,
  UnauthorizedAppException,
} from '../../dist/common/exceptions/domain-exceptions.js';
import { AccountsRepository } from '../../dist/accounts/accounts.repository.js';
import { ActivationService } from '../../dist/auth/activation.service.js';
import {
  ACCESS_TTL_MS,
  RedisSessionStore,
  SESSION_TTL_MS,
} from '../../dist/auth/session-store.js';
import {
  SessionService,
  UnauthorizedSessionError,
} from '../../dist/auth/session.service.js';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { createRedisClient } from '../../dist/db/redis.js';
import { ActivationMailerService } from '../../dist/mail/mail.service.js';
import { AuthController } from '../../dist/auth/auth.controller.js';
import {
  ACCESS_COOKIE_NAME,
  AuthGuard,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CsrfGuard,
  REFRESH_COOKIE_NAME,
  ROLES_METADATA_KEY,
  RolesGuard,
} from '../../dist/security/guards.js';

const config = loadDatabaseConfig();
const CSRF_SECRET = 'test-csrf-secret-for-sessions-suite';
const JWT_SECRET = 'test-jwt-secret-for-sessions-suite';

function makeExecutionContext(request, requiredRoles) {
  const handler = {};
  if (requiredRoles) {
    Reflect.defineMetadata(ROLES_METADATA_KEY, requiredRoles, handler);
  }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => class DummyController {},
  };
}

test('AC-04 & AC-14: session hash fields, TTLs, concurrent refresh, lock/unlock, logout, and guards', async () => {
  const pool = createPgPool(config.databaseUrl);
  const redis = createRedisClient(config.redisUrl);

  try {
    await runMigrations(pool);
    await redis.connect();

    const accounts = new AccountsRepository(pool);
    const sentTokens = [];
    const mailSender = {
      async sendActivationEmail(_to, activationUrl) {
        sentTokens.push(new URL(activationUrl).searchParams.get('token'));
      },
    };
    const buildUrl = (token) => `https://example.test/activate?token=${token}`;
    const mailer = new ActivationMailerService(
      pool,
      redis,
      accounts,
      mailSender,
      buildUrl,
    );
    const activation = new ActivationService(accounts, redis, mailer, buildUrl);
    const sessionStore = new RedisSessionStore(redis, JWT_SECRET);
    const sessions = new SessionService(
      accounts,
      activation,
      sessionStore,
      CSRF_SECRET,
    );

    const email = `session-${randomUUID()}@example.com`;
    await activation.register(email, 'StrongPass123!');
    await activation.activate(sentTokens[0]);

    const t0 = 1_764_100_000_000;
    const bundle1 = await sessions.signIn(email, 'StrongPass123!', t0);
    const bundle2 = await sessions.signIn(email, 'StrongPass123!', t0);

    // Verify issued credentials are signed 3-part JWTs and parse cleanly
    assert.equal(bundle1.session.accessCredential.split('.').length, 3);
    assert.equal(bundle1.session.refreshCredential.split('.').length, 3);
    const parsedAccess = sessionStore.parseJwt(
      bundle1.session.accessCredential,
      'access',
      t0,
    );
    assert.equal(parsedAccess?.sub, bundle1.account.id);
    assert.equal(parsedAccess?.sid, bundle1.session.sessionId);
    assert.equal(parsedAccess?.typ, 'access');

    // 1. Verify exact Redis hash fields and 15m / 7d lifetimes
    const hash = await redis.hgetall(`session:${bundle1.session.sessionId}`);
    assert.deepEqual(Object.keys(hash).sort(), [
      'accessToken',
      'accessTokenExpAt',
      'refreshToken',
      'refreshTokenExpAt',
      'userInfo',
    ]);
    assert.equal(Number(hash.accessTokenExpAt), t0 + ACCESS_TTL_MS);
    assert.equal(Number(hash.refreshTokenExpAt), t0 + SESSION_TTL_MS);
    assert.deepEqual(JSON.parse(hash.userInfo), {
      id: bundle1.account.id,
      sessionGeneration: 0,
    });

    // 2. Access expires at 15 minutes; valid before 15 minutes
    const authOk = await sessions.authenticate(
      bundle1.session.accessCredential,
      t0 + ACCESS_TTL_MS - 1,
    );
    assert.equal(authOk.account.id, bundle1.account.id);

    await assert.rejects(
      sessions.authenticate(bundle1.session.accessCredential, t0 + ACCESS_TTL_MS),
      UnauthorizedSessionError,
    );

    // 3. Concurrent refresh: at most one rotation succeeds; old token cannot refresh again
    const results = await Promise.allSettled([
      sessions.refresh(bundle1.session.refreshCredential, t0 + ACCESS_TTL_MS),
      sessions.refresh(bundle1.session.refreshCredential, t0 + ACCESS_TTL_MS),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof UnauthorizedSessionError);

    const rotated = fulfilled[0].value;
    assert.equal(
      rotated.session.refreshTokenExpAt,
      t0 + SESSION_TTL_MS,
    );

    // Reusing old refresh token fails
    await assert.rejects(
      sessions.refresh(bundle1.session.refreshCredential, t0 + ACCESS_TTL_MS + 1000),
      UnauthorizedSessionError,
    );

    // Refresh at or after 7-day deadline fails
    await assert.rejects(
      sessions.refresh(rotated.session.refreshCredential, t0 + SESSION_TTL_MS),
      UnauthorizedSessionError,
    );

    // 4. Lock invalidates all existing sessions; unlock permits only new sign-ins
    await accounts.lockAccount(bundle1.account.id);

    await assert.rejects(
      sessions.authenticate(bundle2.session.accessCredential, t0 + 1000),
      UnauthorizedSessionError,
    );
    await assert.rejects(
      sessions.refresh(bundle2.session.refreshCredential, t0 + 1000),
      UnauthorizedSessionError,
    );

    await accounts.unlockAccount(bundle1.account.id);

    // Previously invalidated session remains invalid after unlock
    await assert.rejects(
      sessions.authenticate(bundle2.session.accessCredential, t0 + 1000),
      UnauthorizedSessionError,
    );

    // New sign-in succeeds after unlock
    const freshBundle = await sessions.signIn(email, 'StrongPass123!', Date.now());
    assert.equal(freshBundle.session.userInfo.sessionGeneration, 1);

    // 5. Guards: AuthGuard, CsrfGuard, RolesGuard
    const authGuard = new AuthGuard(sessions);
    const csrfGuard = new CsrfGuard(CSRF_SECRET);
    const rolesGuard = new RolesGuard(new Reflector());

    const unauthReq = { method: 'GET', headers: {} };
    await assert.rejects(
      authGuard.canActivate(makeExecutionContext(unauthReq)),
      UnauthorizedAppException,
    );

    const validReq = {
      method: 'POST',
      headers: {
        cookie: `${ACCESS_COOKIE_NAME}=${freshBundle.session.accessCredential}; ${CSRF_COOKIE_NAME}=${freshBundle.csrfToken}`,
        [CSRF_HEADER_NAME]: freshBundle.csrfToken,
      },
    };
    assert.equal(await authGuard.canActivate(makeExecutionContext(validReq)), true);
    assert.equal(csrfGuard.canActivate(makeExecutionContext(validReq)), true);

    const badCsrfReq = {
      method: 'POST',
      headers: {
        cookie: `${ACCESS_COOKIE_NAME}=${freshBundle.session.accessCredential}; ${CSRF_COOKIE_NAME}=${freshBundle.csrfToken}`,
        [CSRF_HEADER_NAME]: 'tampered',
      },
      auth: validReq.auth,
    };
    assert.throws(
      () => csrfGuard.canActivate(makeExecutionContext(badCsrfReq)),
      ForbiddenAppException,
    );

    // USER cannot access ADMIN route; USER can access USER route
    assert.throws(
      () => rolesGuard.canActivate(makeExecutionContext(validReq, ['ADMIN'])),
      ForbiddenAppException,
    );
    assert.equal(
      rolesGuard.canActivate(makeExecutionContext(validReq, ['USER'])),
      true,
    );

    // 6. Logout blacklists unexpired accessToken and removes session/refreshToken from Redis
    const { createHash } = await import('node:crypto');
    const accessHash = createHash('sha256')
      .update(freshBundle.session.accessCredential)
      .digest('hex');
    await sessions.logout(
      freshBundle.session.sessionId,
      freshBundle.session.accessCredential,
      freshBundle.session.accessTokenExpAt - 60_000,
    );
    const afterLogout = await redis.hgetall(
      `session:${freshBundle.session.sessionId}`,
    );
    assert.deepEqual(afterLogout, {});
    assert.equal(await redis.get(`blacklist:access:${accessHash}`), '1');
    await assert.rejects(
      sessions.authenticate(
        freshBundle.session.accessCredential,
        freshBundle.session.accessTokenExpAt - 60_000,
      ),
      UnauthorizedSessionError,
    );

    // 7. AuthController register -> activate -> signIn -> refresh -> signOut
    const controller = new AuthController(
      activation,
      sessions,
      CSRF_SECRET,
      false,
    );
    const signupEmail = `ctrl-${randomUUID()}@example.com`;
    const regCtrl = await controller.register({
      email: signupEmail,
      password: 'StrongPass123!',
    });
    assert.equal(regCtrl.status, 'pending');
    await controller.activate({ token: sentTokens[sentTokens.length - 1] });
    const capturedHeaders = {};
    const mockRes = {
      setHeader(name, value) {
        capturedHeaders[name] = value;
      },
    };

    const signInResult = await controller.signIn(
      { email, password: 'StrongPass123!' },
      mockRes,
    );
    assert.equal(signInResult.account.email, email);

    const setCookies = capturedHeaders['Set-Cookie'];
    assert.equal(Array.isArray(setCookies), true);
    assert.equal(setCookies.length, 3);
    assert.ok(setCookies[0].startsWith(`${ACCESS_COOKIE_NAME}=`));
    assert.ok(setCookies[0].includes('HttpOnly'));
    assert.ok(setCookies[1].startsWith(`${REFRESH_COOKIE_NAME}=`));
    assert.ok(setCookies[1].includes('HttpOnly'));
    assert.ok(setCookies[2].startsWith(`${CSRF_COOKIE_NAME}=`));
    assert.equal(setCookies[2].includes('HttpOnly'), false);

    const refreshCookieVal = decodeURIComponent(
      setCookies[1].split(';')[0].split('=')[1],
    );
    const csrfCookieVal = decodeURIComponent(
      setCookies[2].split(';')[0].split('=')[1],
    );

    await controller.refreshSession(
      {
        headers: {
          cookie: `${REFRESH_COOKIE_NAME}=${refreshCookieVal}; ${CSRF_COOKIE_NAME}=${csrfCookieVal}`,
          [CSRF_HEADER_NAME]: csrfCookieVal,
        },
      },
      mockRes,
    );
    assert.equal(capturedHeaders['Set-Cookie'].length, 3);

    const rotatedRefreshVal = decodeURIComponent(
      capturedHeaders['Set-Cookie'][1].split(';')[0].split('=')[1],
    );
    const rotatedCsrfVal = decodeURIComponent(
      capturedHeaders['Set-Cookie'][2].split(';')[0].split('=')[1],
    );

    await controller.signOut(
      {
        headers: {
          cookie: `${REFRESH_COOKIE_NAME}=${rotatedRefreshVal}; ${CSRF_COOKIE_NAME}=${rotatedCsrfVal}`,
          [CSRF_HEADER_NAME]: rotatedCsrfVal,
        },
      },
      mockRes,
    );
    assert.ok(capturedHeaders['Set-Cookie'][0].includes('Max-Age=0'));
    assert.ok(capturedHeaders['Set-Cookie'][1].includes('Max-Age=0'));
    assert.ok(capturedHeaders['Set-Cookie'][2].includes('Max-Age=0'));
  } finally {
    await redis.quit();
    await pool.end();
  }
});
