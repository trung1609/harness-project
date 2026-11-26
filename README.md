# Sổ tay cá nhân

The workspace contains a Next.js frontend and a NestJS API. See the [phase and task status](docs/PROGRESS.md) and the [implementation plan](docs/plans/phase-3-implementation.md).

Start with [AGENTS.md](AGENTS.md), [project context](docs/PROJECT.md), [progress](docs/PROGRESS.md), and [Harness usage](harness/README.md).

## Run locally

Use Node.js 22.13 or newer in the 22.x series and npm 10 or later. Install from the root lockfile:

```sh
npm ci
```

Run the applications in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

The frontend is at `http://localhost:3000`. The API health route is `http://localhost:3001/api/v1/health`. The API accepts a `PORT` override. The workspace foundation runs without a database or provider credentials.

```sh
npm run build
npm run lint
npm run typecheck
npm test
```

`npm test` builds both applications and checks their HTTP responses on disposable local ports. The health route checks app startup.
