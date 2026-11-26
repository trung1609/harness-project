# NestJS backend architecture rules

Apply these rules for all backend work under `apps/be/src/` alongside `docs/CONVENTIONS.md` and `docs/ARCHITECTURE.md`.

## Domain-driven modular boundaries

- Organize backend code by domain module (`auth/`, `accounts/`, `tasks/`, `notes/`, `scheduling/`, `support/`, `media/`, `mail/`, `security/`, `db/`, `config/`).
- Keep domain rules, state transitions, ownership checks, and database transactions inside **services** and **repositories**.
- Never put business logic, SQL queries, Redis commands, or external provider calls inside controllers.

## Thin controllers

- Controllers handle only HTTP transport concerns: route binding, input/DTO validation, calling application/domain services, and mapping domain outcomes or errors to HTTP responses matching `docs/specs/openapi.json`.
- Dependency direction must remain strictly one-way: **Controllers → Services → Repositories / Provider Adapters**. Repositories and domain services must not depend on HTTP request/response objects or NestJS controllers.

## Separation of auth, security, and guards

- Isolate session/token verification, CSRF validation, rate limiting, and role/account-status authorization in dedicated guards, decorators, and middleware under `src/security/` and `src/auth/`.
- Do not duplicate authentication, session parsing, or role checks inside feature controllers; apply shared guards declaratively on routes and enforce resource ownership in domain services and PostgreSQL constraints.
- Keep external integrations (PostgreSQL, Redis, Gmail SMTP, Cloudinary) behind explicit adapter/service interfaces so domain logic remains testable with test doubles.
