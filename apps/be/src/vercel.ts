import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestApplicationOptions } from '@nestjs/common';
import { createApp } from './app.js';

type HttpRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

let cachedHandlerPromise: Promise<HttpRequestHandler> | null = null;

/**
 * Lazily initializes and caches the NestJS HTTP handler for Vercel serverless invocations.
 */
export function getVercelHandler(
  options?: NestApplicationOptions,
): Promise<HttpRequestHandler> {
  if (!cachedHandlerPromise) {
    cachedHandlerPromise = (async () => {
      const app = await createApp(options);
      await app.init();
      return app.getHttpAdapter().getInstance() as HttpRequestHandler;
    })();
  }
  return cachedHandlerPromise;
}

/**
 * Vercel Node.js Function entrypoint delegating incoming requests to NestJS.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const expressHandler = await getVercelHandler({ logger: false });
  await expressHandler(req, res);
}
