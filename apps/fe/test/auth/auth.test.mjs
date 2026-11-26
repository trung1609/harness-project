import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import next from 'next';
import ts from 'typescript';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function loadTsModule(relPath, mocks = {}) {
  const source = await readFile(join(ROOT_DIR, relPath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const customRequire = (id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected import ${id} in ${relPath}`);
  };
  const fn = new Function('require', 'module', 'exports', transpiled.outputText);
  fn(customRequire, mod, mod.exports);
  return mod.exports;
}

test('AC-13 & AC-14: auth pages render and auth workflow handles pending, expired, resend, refresh, locked, and revoked sessions', { timeout: 25_000 }, async () => {
  // 1. Test auth client & workflow against simulated backend contract
  const clientMod = await loadTsModule('src/lib/api/client.ts');
  const apiMod = await loadTsModule('src/features/auth/auth-api.ts', {
    '../../lib/api/client': clientMod,
  });
  const stateMod = await loadTsModule('src/features/auth/auth-state.ts', {
    '../../lib/api/client': clientMod,
  });

  const calls = [];
  let refreshShouldSucceed = true;
  let protectedProbeCount = 0;

  const jsonRes = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => data,
  });

  const mockFetch = async (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers });
    const body = init?.body ? JSON.parse(init.body) : {};

    if (url.endsWith('/auth/sessions') && body.email === 'pending@example.com') {
      return jsonRes(403, { code: 'ACCOUNT_PENDING', message: 'Pending' });
    }
    if (url.endsWith('/auth/sessions') && body.email === 'locked@example.com') {
      return jsonRes(403, { code: 'ACCOUNT_LOCKED', message: 'Locked' });
    }
    if (url.endsWith('/auth/activations') && body.token === 'expired') {
      return jsonRes(410, { code: 'ACTIVATION_TOKEN_EXPIRED', message: 'Expired' });
    }
    if (url.endsWith('/auth/activation-emails')) {
      return jsonRes(202, { status: 'accepted' });
    }
    if (url.endsWith('/auth/session-refreshes')) {
      return jsonRes(refreshShouldSucceed ? 204 : 401, null);
    }
    if (url.includes('/tasks')) {
      protectedProbeCount += 1;
      if (protectedProbeCount === 1) {
        return jsonRes(401, { code: 'UNAUTHORIZED', message: 'Expired' });
      }
      return jsonRes(200, { items: [], page: 1, pageSize: 10, totalItems: 0 });
    }
    return jsonRes(404, null);
  };

  const api = apiMod.createAuthApiClient({
    fetchImpl: mockFetch,
    cookieSource: 'csrf_token=signed-csrf-123',
  });
  const workflow = stateMod.createAuthWorkflow(api);

  // Pending account sign-in offers resend
  const pendingRes = await workflow.signIn('pending@example.com', 'StrongPass123!');
  assert.equal(pendingRes.kind, 'pending_account');
  assert.equal(pendingRes.canResend, true);

  // Locked account sign-in presents unlock entry point
  const lockedRes = await workflow.signIn('locked@example.com', 'StrongPass123!');
  assert.equal(lockedRes.kind, 'locked_account');
  assert.equal(lockedRes.unlockPath, '/unlock');

  // Expired activation link offers resend -> generic acknowledgment
  const expiredRes = await workflow.activate('expired');
  assert.equal(expiredRes.kind, 'activation_expired');
  assert.equal(expiredRes.canResend, true);

  const resendRes = await workflow.resendActivation('pending@example.com');
  assert.equal(resendRes.kind, 'resent');
  const resendCall = calls.find((c) => c.url.endsWith('/auth/activation-emails'));
  assert.equal(resendCall.headers['X-CSRF-Token'], 'signed-csrf-123');

  // Reload retains valid session via automatic refresh
  const validReload = await workflow.restoreProtectedSession();
  assert.equal(validReload.kind, 'session_valid');

  // Revoked session redirects to /login
  protectedProbeCount = 0;
  refreshShouldSucceed = false;
  const revokedReload = await workflow.restoreProtectedSession();
  assert.equal(revokedReload.kind, 'session_revoked');
  assert.equal(revokedReload.redirectTo, '/login');

  // 2. Verify built Next.js routes serve HTTP 200
  const app = next({ dev: false, hostname: '127.0.0.1' });
  const handle = app.getRequestHandler();
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });

  try {
    await app.prepare();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();

    for (const [route, pattern] of [
      ['/login', /Đăng nhập/u],
      ['/register', /Đăng ký tài khoản/u],
      ['/activate', /Kích hoạt tài khoản|Đang tải/u],
      ['/workspace', /Kiểm tra phiên đăng nhập|Không gian làm việc|Đang tải/iu],
    ]) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), pattern);
    }
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await app.close();
  }
});
