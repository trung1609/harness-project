import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import next from "next";

test("the built Next.js app serves its home page", { timeout: 20_000 }, async () => {
  const app = next({ dev: false, hostname: "127.0.0.1" });
  const handle = app.getRequestHandler();
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
  });

  try {
    await app.prepare();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<h1[^>]*>Sổ tay cá nhân<\/h1>/u);
  } finally {
    try {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      }
    } finally {
      await app.close();
    }
  }
});
