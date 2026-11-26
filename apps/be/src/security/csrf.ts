import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generates a signed, session-bound CSRF token.
 */
export function createCsrfToken(sessionId: string, secret: string): string {
  const nonce = randomBytes(16).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${sessionId}.${nonce}`)
    .digest('base64url');
  return `${nonce}.${signature}`;
}

/**
 * Verifies a signed CSRF token against the expected session ID in constant time.
 */
export function verifyCsrfToken(
  token: string,
  sessionId: string,
  secret: string,
): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [nonce, providedSig] = parts;
  if (!nonce || !providedSig) {
    return false;
  }

  const expectedSig = createHmac('sha256', secret)
    .update(`${sessionId}.${nonce}`)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  return (
    providedBuf.length === expectedBuf.length &&
    timingSafeEqual(providedBuf, expectedBuf)
  );
}

/**
 * Parses an HTTP Cookie header into key-value pairs.
 */
export function parseCookieHeader(
  cookieHeader: string | undefined,
): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}
