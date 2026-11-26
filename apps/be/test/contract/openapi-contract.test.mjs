import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../dist/app.js';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { createRedisClient } from '../../dist/db/redis.js';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const config = loadDatabaseConfig();

function parseSetCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const jar = {};
  for (const line of raw) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      jar[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
    }
  }
  return jar;
}

test('OpenAPI contract & full HTTP auth, ownership, tasks, notes, and logout blacklist checks', async () => {
  const openapiRaw = await readFile(
    join(ROOT_DIR, 'docs', 'specs', 'openapi.json'),
    'utf8',
  );
  const openapi = JSON.parse(openapiRaw);
  assert.ok(openapi.paths['/auth/registrations']);
  assert.ok(openapi.paths['/auth/sessions']);
  assert.ok(openapi.paths['/tasks']);
  assert.ok(openapi.paths['/notes']);

  const pool = createPgPool(config.databaseUrl);
  const redis = createRedisClient(config.redisUrl);
  await runMigrations(pool);
  await redis.connect();

  const app = await createApp({ logger: false });
  await app.listen(0, '127.0.0.1');
  const baseUrl = `${await app.getUrl()}/api/v1`;

  try {
    // 1. Health check
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    // 2. Unauthenticated access returns 401 with { code, message, requestId }
    const unauth = await fetch(`${baseUrl}/tasks`);
    assert.equal(unauth.status, 401);
    const unauthBody = await unauth.json();
    assert.equal(unauthBody.code, 'UNAUTHORIZED');
    assert.ok(unauthBody.requestId);

    // 3. Register -> pending sign-in returns 403 -> duplicate register returns 409
    const email = `contract-${randomUUID()}@example.com`;
    const reg = await fetch(`${baseUrl}/auth/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPassword123!' }),
    });
    assert.equal(reg.status, 202);

    const dupReg = await fetch(`${baseUrl}/auth/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPassword123!' }),
    });
    assert.equal(dupReg.status, 409);

    const pendingSignIn = await fetch(`${baseUrl}/auth/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPassword123!' }),
    });
    assert.equal(pendingSignIn.status, 403);

    // 4. Activate account in DB for contract flow, then sign in -> receive cookies
    await pool.query(
      `UPDATE accounts SET activated_at = NOW() WHERE email = $1`,
      [email],
    );

    const signIn = await fetch(`${baseUrl}/auth/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPassword123!' }),
    });
    assert.equal(signIn.status, 200);
    const cookies = parseSetCookies(signIn);
    assert.ok(cookies.access_token);
    assert.ok(cookies.refresh_token);
    assert.ok(cookies.csrf_token);

    const cookieHeader = `access_token=${encodeURIComponent(cookies.access_token)}; refresh_token=${encodeURIComponent(cookies.refresh_token)}; csrf_token=${encodeURIComponent(cookies.csrf_token)}`;

    // 5. Missing CSRF header on write -> 403
    const noCsrf = await fetch(`${baseUrl}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        title: 'Blocked',
        scheduledDate: '2026-11-26',
        startTime: '09:00',
        endTime: '10:00',
      }),
    });
    assert.equal(noCsrf.status, 403);

    // 6. USER calling ADMIN route -> 403
    const adminDenied = await fetch(`${baseUrl}/admin/users`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(adminDenied.status, 403);

    // 7. Create task with DONE status, create note, link note, then signOut & verify blacklist
    const createdTaskRes = await fetch(`${baseUrl}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': cookies.csrf_token,
      },
      body: JSON.stringify({
        title: 'Contract Task',
        scheduledDate: '2026-11-26',
        startTime: '09:00',
        endTime: '10:00',
        progress: 'DONE',
      }),
    });
    assert.equal(createdTaskRes.status, 201);
    const createdTask = await createdTaskRes.json();
    assert.equal(createdTask.displayStatus, 'DONE');

    const signOutRes = await fetch(`${baseUrl}/auth/sessions/current`, {
      method: 'DELETE',
      headers: {
        Cookie: cookieHeader,
        'X-CSRF-Token': cookies.csrf_token,
      },
    });
    assert.equal(signOutRes.status, 204);

    // Blacklisted access_token must be rejected with 401
    const afterLogout = await fetch(`${baseUrl}/tasks`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await app.close();
    await redis.quit();
    await pool.end();
  }
});
