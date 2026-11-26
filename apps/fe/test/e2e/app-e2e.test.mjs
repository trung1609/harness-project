import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import next from 'next';

test('E2E: all built Next.js application routes serve HTTP 200', { timeout: 25_000 }, async () => {
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

    const routes = [
      '/',
      '/login',
      '/register',
      '/activate',
      '/workspace',
      '/notes/new',
      '/support',
      '/unlock',
      '/admin',
    ];

    for (const route of routes) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`, {
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(res.status, 200, `Expected 200 for ${route}, got ${res.status}`);
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
