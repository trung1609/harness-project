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

test('AC-04, AC-12, AC-15–17: support upload retry, viewing URL expiry, ADMIN protection, approval, and pages', { timeout: 25_000 }, async () => {
  const clientMod = await loadTsModule('src/lib/api/client.ts');
  const supportMod = await loadTsModule('src/features/support/support-api.ts', {
    '../../lib/api/client': clientMod,
  });
  const adminMod = await loadTsModule('src/features/admin/admin-api.ts', {
    '../../lib/api/client': clientMod,
  });

  // 1. Client-side file validation (10 MB boundary and allowed formats)
  assert.equal(
    supportMod.validateEvidenceFile({ size: 10_000_000, type: 'image/png' }),
    null,
  );
  assert.ok(
    supportMod.validateEvidenceFile({ size: 10_000_001, type: 'image/png' }) !== null,
  );
  assert.ok(
    supportMod.validateEvidenceFile({ size: 1024, type: 'image/gif' }) !== null,
  );

  // 2. Expired viewing URL check
  assert.equal(
    supportMod.isViewingUrlExpired('2026-11-26T10:00:00Z', Date.parse('2026-11-26T10:01:00Z')),
    true,
  );
  assert.equal(
    supportMod.isViewingUrlExpired('2026-11-26T10:05:00Z', Date.parse('2026-11-26T10:01:00Z')),
    false,
  );

  // 3. Upload failure and retry + protected ADMIN 403 vs ADMIN approval
  let uploadFail = true;
  let callerRole = 'USER';
  const jsonRes = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => data,
  });

  const mockFetch = async (url) => {
    if (url.includes('cloudinary')) {
      return jsonRes(uploadFail ? 500 : 200, {});
    }
    if (url.endsWith('/support/evidence-upload-intents')) {
      return jsonRes(201, {
        intentId: 'intent-1',
        publicId: 'support/u1/ev1',
        expiresAt: '2026-11-26T10:10:00Z',
        uploadParams: {},
      });
    }
    if (url.endsWith('/support/requests')) {
      return jsonRes(201, {
        id: 'req-1',
        requesterId: 'u1',
        kind: 'BUG_REPORT',
        text: 'Broken button',
        state: 'SUBMITTED',
        submittedAt: '2026-11-26T10:00:00Z',
        reviewedAt: null,
      });
    }
    if (url.includes('/admin/')) {
      if (callerRole !== 'ADMIN') {
        return jsonRes(403, { code: 'FORBIDDEN', message: 'Forbidden' });
      }
      if (url.includes('/admin/users')) {
        return jsonRes(200, { items: [], page: 1, pageSize: 20, totalItems: 0 });
      }
      if (url.includes('/decisions')) {
        return jsonRes(200, {
          request: {
            id: 'req-1',
            requesterId: 'u1',
            kind: 'UNLOCK',
            text: 'Unlock',
            state: 'RESOLVED',
            submittedAt: '2026-11-26T10:00:00Z',
            reviewedAt: '2026-11-26T10:05:00Z',
          },
          emailDelivered: true,
        });
      }
    }
    return jsonRes(404, null);
  };

  const supportApi = supportMod.createSupportApiClient({
    fetchImpl: mockFetch,
    cookieSource: 'csrf_token=csrf-1',
  });
  const adminApi = adminMod.createAdminApiClient({
    fetchImpl: mockFetch,
    cookieSource: 'csrf_token=csrf-1',
  });

  const intent = await supportApi.createUploadIntent();
  await assert.rejects(
    supportApi.uploadDirectToCloudinary('https://api.cloudinary.test/upload', {}),
    (err) => err instanceof clientMod.ApiError && err.code === 'UPLOAD_FAILED',
  );
  uploadFail = false;
  await supportApi.uploadDirectToCloudinary('https://api.cloudinary.test/upload', {});
  const created = await supportApi.submitRequest({
    kind: 'BUG_REPORT',
    text: 'Broken button',
    intentId: intent.intentId,
  });
  assert.equal(created.state, 'SUBMITTED');

  // Protected ADMIN route rejects USER with 403
  await assert.rejects(
    adminApi.listUsers(1, 20),
    (err) => err instanceof clientMod.ApiError && err.status === 403,
  );

  // ADMIN succeeds & approves unlock
  callerRole = 'ADMIN';
  const usersPage = await adminApi.listUsers(1, 20);
  assert.equal(usersPage.pageSize, 20);
  const decision = await adminApi.recordDecision('req-1', 'APPROVE_UNLOCK');
  assert.equal(decision.request.state, 'RESOLVED');

  // 4. Built Next.js routes serve HTTP 200
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
      ['/support', /Gửi yêu cầu hỗ trợ/u],
      ['/unlock', /Mở khóa tài khoản/u],
      ['/admin', /Đang kiểm tra quyền quản trị|Quản trị hệ thống/u],
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
