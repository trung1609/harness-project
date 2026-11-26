import { createApp } from "./app.js";

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks();
  const port = process.env.PORT ?? "3001";
  const portNumber = Number(port);

  if (!/^\d+$/u.test(port) || portNumber < 1 || portNumber > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  await app.listen(portNumber);
}

void bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to start the API");
  process.exitCode = 1;
});
