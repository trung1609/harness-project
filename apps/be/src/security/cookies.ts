import type { SessionBundle } from '../auth/session.service.js';

export interface CookieResponse {
  setHeader(name: string, value: string | string[]): unknown;
}
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from './guards.js';

export interface CookieOptions {
  secure: boolean;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    secure: boolean;
    maxAgeSeconds: number;
  },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
  ];
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Attaches access_token, refresh_token (HttpOnly) and csrf_token cookies to the HTTP response.
 */
export function setSessionCookies(
  res: CookieResponse,
  bundle: SessionBundle,
  options: CookieOptions,
  nowMs: number = Date.now(),
): void {
  const accessMaxAge = Math.max(
    0,
    Math.floor((bundle.session.accessTokenExpAt - nowMs) / 1000),
  );
  const refreshMaxAge = Math.max(
    0,
    Math.floor((bundle.session.refreshTokenExpAt - nowMs) / 1000),
  );

  res.setHeader('Set-Cookie', [
    serializeCookie(ACCESS_COOKIE_NAME, bundle.session.accessCredential, {
      httpOnly: true,
      secure: options.secure,
      maxAgeSeconds: accessMaxAge,
    }),
    serializeCookie(REFRESH_COOKIE_NAME, bundle.session.refreshCredential, {
      httpOnly: true,
      secure: options.secure,
      maxAgeSeconds: refreshMaxAge,
    }),
    serializeCookie(CSRF_COOKIE_NAME, bundle.csrfToken, {
      httpOnly: false,
      secure: options.secure,
      maxAgeSeconds: refreshMaxAge,
    }),
  ]);
}

/**
 * Clears access_token, refresh_token, and csrf_token cookies on sign-out.
 */
export function clearSessionCookies(
  res: CookieResponse,
  options: CookieOptions,
): void {
  res.setHeader('Set-Cookie', [
    serializeCookie(ACCESS_COOKIE_NAME, '', {
      httpOnly: true,
      secure: options.secure,
      maxAgeSeconds: 0,
    }),
    serializeCookie(REFRESH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: options.secure,
      maxAgeSeconds: 0,
    }),
    serializeCookie(CSRF_COOKIE_NAME, '', {
      httpOnly: false,
      secure: options.secure,
      maxAgeSeconds: 0,
    }),
  ]);
}
