import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import jwt, { type JwtPayload } from 'jsonwebtoken';

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUserInfo {
  id: string;
  sessionGeneration: number;
}

export interface SessionJwtClaims extends JwtPayload {
  sub: string;
  sid: string;
  gen: number;
  typ: 'access' | 'refresh';
  jti: string;
}

export interface IssuedSession {
  sessionId: string;
  accessCredential: string;
  refreshCredential: string;
  accessTokenExpAt: number;
  refreshTokenExpAt: number;
  userInfo: SessionUserInfo;
}

export interface AuthenticatedSession {
  sessionId: string;
  userInfo: SessionUserInfo;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function blacklistKey(tokenHash: string): string {
  return `blacklist:access:${tokenHash}`;
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

const ATOMIC_ROTATE_LUA = `
local key = KEYS[1]
local expectedRefreshHash = ARGV[1]
local nowMs = tonumber(ARGV[2])
local newAccessHash = ARGV[3]
local newRefreshHash = ARGV[4]
local newAccessExpMs = tonumber(ARGV[5])

local data = redis.call('HMGET', key, 'refreshToken', 'refreshTokenExpAt', 'userInfo')
local storedRefresh = data[1]
local refreshExpStr = data[2]
local userInfo = data[3]

if not storedRefresh or not refreshExpStr or not userInfo then
  return {0, 'MISSING'}
end

local refreshExpMs = tonumber(refreshExpStr)
if not refreshExpMs or nowMs >= refreshExpMs then
  redis.call('DEL', key)
  return {0, 'EXPIRED'}
end

if storedRefresh ~= expectedRefreshHash then
  return {0, 'MISMATCH'}
end

local clampedAccessExp = math.min(newAccessExpMs, refreshExpMs)
redis.call('HSET', key,
  'accessToken', newAccessHash,
  'refreshToken', newRefreshHash,
  'accessTokenExpAt', tostring(clampedAccessExp)
)
return {1, userInfo, tostring(clampedAccessExp), refreshExpStr}
`;

/**
 * Redis-backed session store that signs and parses JWT access/refresh tokens
 * while keeping five-field session hashes and atomic refresh rotation in Redis.
 */
export class RedisSessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly jwtSecret: string,
  ) {}

  private signJwt(
    userInfo: SessionUserInfo,
    sessionId: string,
    typ: 'access' | 'refresh',
    nowMs: number,
    expMs: number,
  ): string {
    const iat = Math.floor(nowMs / 1000);
    const exp = Math.floor(expMs / 1000);
    return jwt.sign(
      {
        sub: userInfo.id,
        sid: sessionId,
        gen: userInfo.sessionGeneration,
        typ,
        jti: randomBytes(16).toString('base64url'),
        iat,
        exp,
      },
      this.jwtSecret,
      { algorithm: 'HS256' },
    );
  }

  /**
   * Parses and verifies a signed session JWT, returning its typed claims or null if invalid/expired.
   */
  parseJwt(
    rawToken: string | undefined,
    expectedType: 'access' | 'refresh',
    nowMs: number = Date.now(),
  ): SessionJwtClaims | null {
    if (!rawToken) {
      return null;
    }

    try {
      const decoded = jwt.verify(rawToken, this.jwtSecret, {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(nowMs / 1000),
      });
      if (typeof decoded !== 'object' || decoded === null) {
        return null;
      }
      const claims = decoded as SessionJwtClaims;
      if (
        claims.typ !== expectedType ||
        typeof claims.sid !== 'string' ||
        !claims.sid ||
        typeof claims.sub !== 'string' ||
        typeof claims.gen !== 'number'
      ) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }

  async createSession(
    userInfo: SessionUserInfo,
    nowMs: number = Date.now(),
  ): Promise<IssuedSession> {
    const sessionId = randomBytes(18).toString('base64url');
    const refreshTokenExpAt = nowMs + SESSION_TTL_MS;
    const accessTokenExpAt = Math.min(nowMs + ACCESS_TTL_MS, refreshTokenExpAt);

    const accessCredential = this.signJwt(
      userInfo,
      sessionId,
      'access',
      nowMs,
      accessTokenExpAt,
    );
    const refreshCredential = this.signJwt(
      userInfo,
      sessionId,
      'refresh',
      nowMs,
      refreshTokenExpAt,
    );

    const key = sessionKey(sessionId);
    const multi = this.redis.multi();
    multi.hset(key, {
      accessToken: hashSecret(accessCredential),
      refreshToken: hashSecret(refreshCredential),
      accessTokenExpAt: String(accessTokenExpAt),
      refreshTokenExpAt: String(refreshTokenExpAt),
      userInfo: JSON.stringify(userInfo),
    });
    multi.pexpire(key, SESSION_TTL_MS);
    await multi.exec();

    return {
      sessionId,
      accessCredential,
      refreshCredential,
      accessTokenExpAt,
      refreshTokenExpAt,
      userInfo,
    };
  }

  async authenticateAccess(
    rawCredential: string | undefined,
    nowMs: number = Date.now(),
  ): Promise<AuthenticatedSession | null> {
    const claims = this.parseJwt(rawCredential, 'access', nowMs);
    if (!claims || !rawCredential) {
      return null;
    }

    const tokenHash = hashSecret(rawCredential);
    const isBlacklisted = await this.redis.get(blacklistKey(tokenHash));
    if (isBlacklisted !== null) {
      return null;
    }

    const fields = await this.redis.hmget(
      sessionKey(claims.sid),
      'accessToken',
      'accessTokenExpAt',
      'refreshTokenExpAt',
      'userInfo',
    );
    const [storedAccess, accessExpStr, refreshExpStr, userInfoJson] = fields;
    if (!storedAccess || !accessExpStr || !refreshExpStr || !userInfoJson) {
      return null;
    }

    const accessExpMs = Number(accessExpStr);
    const refreshExpMs = Number(refreshExpStr);
    if (
      !Number.isFinite(accessExpMs) ||
      !Number.isFinite(refreshExpMs) ||
      nowMs >= accessExpMs ||
      nowMs >= refreshExpMs
    ) {
      return null;
    }

    if (!safeEqualHex(storedAccess, tokenHash)) {
      return null;
    }

    const userInfo = JSON.parse(userInfoJson) as SessionUserInfo;
    if (
      claims.sub !== userInfo.id ||
      claims.gen !== userInfo.sessionGeneration
    ) {
      return null;
    }

    return {
      sessionId: claims.sid,
      userInfo,
    };
  }

  async rotateRefresh(
    rawCredential: string | undefined,
    nowMs: number = Date.now(),
  ): Promise<IssuedSession | null> {
    const claims = this.parseJwt(rawCredential, 'refresh', nowMs);
    if (!claims || !rawCredential) {
      return null;
    }

    const existingRefreshExpStr = await this.redis.hget(
      sessionKey(claims.sid),
      'refreshTokenExpAt',
    );
    if (!existingRefreshExpStr) {
      return null;
    }
    const existingRefreshExpMs = Number(existingRefreshExpStr);
    if (!Number.isFinite(existingRefreshExpMs) || nowMs >= existingRefreshExpMs) {
      await this.redis.del(sessionKey(claims.sid));
      return null;
    }

    const userInfo: SessionUserInfo = {
      id: claims.sub,
      sessionGeneration: claims.gen,
    };
    const newAccessExpMs = Math.min(nowMs + ACCESS_TTL_MS, existingRefreshExpMs);
    const newAccessCredential = this.signJwt(
      userInfo,
      claims.sid,
      'access',
      nowMs,
      newAccessExpMs,
    );
    const newRefreshCredential = this.signJwt(
      userInfo,
      claims.sid,
      'refresh',
      nowMs,
      existingRefreshExpMs,
    );

    const result = (await this.redis.eval(
      ATOMIC_ROTATE_LUA,
      1,
      sessionKey(claims.sid),
      hashSecret(rawCredential),
      String(nowMs),
      hashSecret(newAccessCredential),
      hashSecret(newRefreshCredential),
      String(newAccessExpMs),
    )) as [number, string, string?, string?];

    if (!result || result[0] !== 1) {
      return null;
    }

    return {
      sessionId: claims.sid,
      accessCredential: newAccessCredential,
      refreshCredential: newRefreshCredential,
      accessTokenExpAt: Number(result[2]),
      refreshTokenExpAt: Number(result[3]),
      userInfo: JSON.parse(result[1]) as SessionUserInfo,
    };
  }

  async deleteSession(
    sessionId: string,
    rawAccessCredential?: string,
    nowMs: number = Date.now(),
  ): Promise<void> {
    const multi = this.redis.multi();
    multi.del(sessionKey(sessionId));

    if (rawAccessCredential) {
      const claims = this.parseJwt(rawAccessCredential, 'access', nowMs);
      if (claims && typeof claims.exp === 'number') {
        const remainingMs = claims.exp * 1000 - nowMs;
        if (remainingMs > 0) {
          multi.set(
            blacklistKey(hashSecret(rawAccessCredential)),
            '1',
            'PX',
            remainingMs,
          );
        }
      }
    }

    await multi.exec();
  }
}
