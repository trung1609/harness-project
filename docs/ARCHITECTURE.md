# Phase 2 — Architecture

**Status: Phase 2 baseline.** The selected stack and first-release behavior come from [the requirements baseline](REQUIREMENTS.md). The [data and scheduling specification](specs/data-and-scheduling.md) contains the ERD, schema constraints and calendar rules.

## Boundaries

- Next.js renders registration, sign-in, notes, daily tasks in the weekly timetable, and the ADMIN screens. NestJS owns validation, permissions, task rules and integrations.
- Use one modular NestJS backend for accounts and sessions, notes, tasks and scheduling, and support. PostgreSQL on Neon owns durable application records. Redis holds activation tokens with TTL and the session hash fields agreed in Phase 1. Email delivers activation and support updates. Cloudinary stores support evidence.
- Check ownership on the backend for every note or task operation, including search, links and bulk actions. ADMIN permissions cover accounts and support only. A request grants access to its submitted evidence. Propose authenticated Cloudinary delivery, with asset access authorized through the support workflow. See [Cloudinary media access control](https://cloudinary.com/documentation/control_access_to_media).

## Logical model and behavior

| Record | Responsibility |
| --- | --- |
| Account | Email, credentials, activation, lock status and role |
| Session and activation token | Redis session keyed by `sessionId` and expiring activation token |
| Note | Owner, title, content, editable start date/time and last update |
| Task occurrence | Owner, scheduled date, same-day start and end, progress and completion time |
| Monthly series | Groups separate weekly task occurrences for selected or bulk edits and deletions |
| Note-task link | Associates a note and a task owned by the same user |
| Support request and evidence | Requester, submitted content, administrative handling, Cloudinary asset reference and verified image URL |

- Use a Vietnam calendar date for a task's day and deadline. Use a timestamp with timezone semantics for instants such as completion and update time. NestJS computes the timing label and late-day count against `Asia/Ho_Chi_Minh`. Next.js displays those values and refreshes them at relevant time boundaries. See [PostgreSQL date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html).
- Changes to a set of weekly occurrences should validate ownership and scope and commit together in PostgreSQL. A progress change affects a single occurrence. Create only weekly dates that fall in the start month.
- Propose expiring the whole Redis session key and checking the access and refresh expiry separately. Define token rotation, logout and revocation on account lock in the authentication specification. See [Redis key expiration](https://redis.io/docs/latest/develop/use/keyspace/).

The [authentication and support specification](specs/auth-and-support.md) defines account activation, session revocation, notification handling and evidence access. The [API contract](specs/api-contract.md) defines the client and backend interface. The user approved separate Vercel projects for Next.js and NestJS in one repository and Gmail SMTP for email. The [deployment and verification specification](specs/deployment-and-verification.md) records the topology, deployment order and staging checks.

## Evidence upload limit

The user approved a 10 MB limit per evidence image and direct upload from the browser to Cloudinary. NestJS verifies the uploaded image and stores its URL in PostgreSQL. The frontend loads the image from Cloudinary using a temporary viewing URL issued after an access check. Verify the 10 MB boundary, supported formats and access controls during integration testing. See [Cloudinary plan comparison](https://cloudinary.com/pricing/compare-plans).

## Verification to specify

- Ownership and ADMIN boundaries across individual operations, lists, links and bulk actions (AC-04, AC-11, AC-16, AC-18).
- Vietnam midnight and month boundaries, independent progress and atomic bulk actions (AC-01–03, AC-05, AC-08–10).
- Valid, expired and resent activation links, session expiry and revoked sessions (AC-13–14).
- Evidence validation, private delivery, failed upload recovery and support email delivery (AC-12, AC-15, AC-17).
