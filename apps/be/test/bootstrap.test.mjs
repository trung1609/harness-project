import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../dist/app.js";

test("the NestJS application responds on its prefixed health route", { timeout: 10_000 }, async () => {
  const app = await createApp({ logger: false });
  try {
    await app.listen(0, "127.0.0.1");
    const baseUrl = await app.getUrl();
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal((await fetch(`${baseUrl}/health`)).status, 404);
  } finally {
    await app.close();
  }
});
