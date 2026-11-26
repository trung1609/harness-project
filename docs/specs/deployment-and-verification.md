# Phase 2 — Deployment feasibility and verification

**Status:** The user approved the two-project Vercel topology, Gmail SMTP and Neon PostgreSQL for the first release. Supporting service checks and staging results are pending. Provider limits were reviewed on 2026-11-26.

## Vercel deployment for a few users

Deploy Next.js and NestJS as two Vercel projects from the same repository. Use `apps/fe` as the Next.js Root Directory and `apps/be` as the NestJS Root Directory. Deploy the backend first and configure its server-side environment variables. Then use its URL in the frontend's external rewrite for `/api/v1/*`, preserving the API path and browser origin. The frontend provides the public HTTPS address and NestJS runs as a Vercel Function. Bind preview deployments to nonproduction credentials and data. Run database migrations on staging and verify cookie forwarding, CSRF, routing and private-response caching before production. See [Vercel monorepos](https://vercel.com/docs/monorepos), [rewrites](https://vercel.com/docs/routing/rewrites) and [NestJS deployment](https://vercel.com/kb/guide/ship-a-nestjs-app-on-vercel).

| Component | Candidate and evidence | Release check |
| --- | --- | --- |
| Next.js and NestJS | Vercel Hobby is the starting plan for this personal project. [Hobby plan](https://vercel.com/docs/plans/hobby) | Verify preview builds, API routing, authentication cookies and cold and warm latencies. |
| PostgreSQL | Neon Free is the selected starting plan. It advertises 1 GB storage and 100 compute-unit hours per project per month. [Neon plans](https://neon.com/docs/introduction/plans) | Run migrations and verify connection recovery, storage monitoring and an off-provider backup and restore on staging data. |
| Redis | Upstash Free lists 500,000 commands per month and 250 MB. Its docs describe Redis transactions and script locking. [Upstash pricing](https://upstash.com/pricing/redis), [locking](https://upstash.com/docs/redis/features/key-locking) | Verify key TTL and exactly one successful concurrent refresh with the selected client. Measure commands per authenticated action. |
| Activation and support email | Gmail SMTP is the selected sender. | Verify SMTP credentials, delivery and retry from a Vercel preview to controlled test recipients. |
| Support images | Cloudinary Free publishes a 10 MB image limit. [Cloudinary plans](https://cloudinary.com/pricing/compare-plans) | Test signed direct upload and temporary viewing URLs from the deployed frontend. |

Zero-cost operation depends on plan eligibility, quotas and the email sender. Persist notification jobs and attempts in PostgreSQL and process them in bounded invocations. Vercel Hobby cron runs at most daily, so use an immediate delivery attempt and validate a separate retry mechanism against the activation-link lifetime. See [Vercel scheduling limits](https://vercel.com/i/event-driven-architecture).

The API draft proposes a 10,000,000-byte file boundary. Test that exact size and one byte above using valid synthetic images. Verify direct upload to Cloudinary, the JSON request that finalizes the submission, the stored image URL, and temporary viewing URL expiry. Verify that an unrelated user cannot obtain a viewing URL and that expired or unconsumed uploads are cleaned up.

## PostgreSQL backup and migration

- Monitor project storage, compute and transfer. Use 70% of the storage allowance as the proposed early warning threshold. Investigate growth before quota exhaustion.
- Schedule regular `pg_dump` exports to storage outside Neon, with access controls and a retention period to be set in implementation planning. Keep provider credentials and backup contents out of Git. Before onboarding real users, restore a staging dump into a separate PostgreSQL database with `pg_restore` and verify that tasks, notes, support requests and image references are intact. Cloudinary image bytes require their own recovery plan.
- For a provider migration, pause writes before taking the final export, validate the restored database, then switch the application connection. Keep the source available until verification is complete. Review the applicable Neon limits before exporting. See [Neon quota and export behavior](https://neon.com/docs/introduction/plans#what-happens-if-i-exceed-my-free-plan-limits) and [PostgreSQL export documentation](https://www.postgresql.org/docs/current/app-pgdump.html).

## Function payload and email constraints

- Vercel documents a default Function payload cap of 4.5 MB for requests and responses. Its 20 MiB inbound beta requires 4 GB memory, while Hobby documents 2 GB. The approved direct Cloudinary upload and proposed temporary viewing links keep image bytes outside the Function. Stage-test private delivery and cleanup. [Function limits](https://vercel.com/docs/functions/limitations), [large-request beta](https://vercel.com/changelog/vercel-functions-now-support-request-bodies-up-to-20mib), [Cloudinary signed uploads](https://cloudinary.com/documentation/client_side_uploading).
- Gmail can send activation and support messages from an authenticated Gmail sender via SMTP with TLS. Vercel documents that outbound SMTP is available except on port 25. Google supports OAuth 2.0 and offers App Passwords to eligible accounts with two-step verification. Keep the sender credential server-side and verify sending from the actual deployment to test recipients. Gmail personal accounts have sending limits. [Vercel SMTP](https://vercel.com/kb/guide/serverless-functions-and-smtp), [Gmail SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp), [Google App Passwords](https://support.google.com/accounts/answer/185833).

## Verification strategy

| Layer | Proposed verification | Required evidence |
| --- | --- | --- |
| Pull request or push | Existing Harness and Gitleaks. Add build, lint, type checks, dependency audit and validation of the OpenAPI document when implementation begins. | Command, commit and result for each check. |
| Unit | Fixed-clock tests for Vietnam midnight, month boundaries, early and late completion, and update scope. Test independent status, paging size and filter rules. | Test results tied to the Phase 1 acceptance IDs. |
| Integration | Use disposable PostgreSQL and Redis. Exercise cross-owner links, rollback and conflicting writes, token expiry and rotation, account lock, and outbox retry. Replace email and media integrations with controlled doubles in regular CI. | Real database and cache results. Report Docker or runtime failures as blocked. |
| API contract | Compare NestJS request and response shapes against the OpenAPI draft after approval. Include wrong-role and non-owner cases and the error envelope. | Tests for success and failure paths and the validated OpenAPI revision. |
| Browser | Drive Next.js against the API. Cover registration and verified activation, schedule editing, note links, account lock and unlock, pagination and support upload. | Test outputs from at least one user session and one ADMIN session. |
| Staging providers | Use synthetic data to test the two Vercel deployments, allowed and oversized uploads, private evidence delivery, real email, Redis rotation and Function cold starts. Force provider errors and verify retry and cleanup. | Observed provider results, quota and timing measurements, and known limits. No external-provider pass is inferred from doubles. |

Recommended release gates are passing the ownership, authentication, calendar, support and upload cases in the relevant environments. Agree on latency and email delivery targets after staging measurements. Track availability, failed email jobs, upload errors and provider quota usage using aggregate metrics and request IDs. Do not log tokens, email link URLs, passwords or evidence contents.
