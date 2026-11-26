# Phase 6 — Deployment and Handoff Report

**Date:** 2026-11-26  
**Vercel Account:** `trung8d2005-3255`  
**Status:** Two-project Vercel Production deployments are live, all 15 Production environment variables are configured on `personal-notebook-api`, and end-to-end `/api/v1/health` + auth-guarded `/api/v1/tasks` routing through `personal-notebook-web` is verified. `vercel_authentication` Deployment Protection remains enabled on the Vercel projects until the owner opens public access.

## 1. Live Vercel Production Projects

| Project | Root Directory | Production URL | Verification |
| --- | --- | --- | --- |
| `personal-notebook-api` | `apps/be` | `https://personal-notebook-api.vercel.app` | **PASS** — Redeployed with all 15 Production env vars (`DATABASE_URL`, `REDIS_URL`, `APP_BASE_URL`, `CSRF_SECRET`, `JWT_SECRET`, `CLOUDINARY_*`, `SMTP_*`, `MAIL_FROM`, `NODE_ENV`, `PORT`). |
| `personal-notebook-web` | `apps/fe` | `https://personal-notebook-web.vercel.app` | **PASS** — `/login` returned `200`; `/api/v1/health` rewrite returned `200 {"status":"ok"}`; unauthenticated `/api/v1/tasks` returned `401 {"code":"UNAUTHORIZED","message":"Authentication required","requestId":"..."}` proving full NestJS module + AuthGuard initialization. |

## 2. Owner Handoff Checklist

1. **Neon database migration:** Run `npm run build --workspace apps/be && npm run db:migrate --workspace apps/be` against the Production Neon `DATABASE_URL` if not already applied.
2. **Deployment Protection:** Both projects currently have `vercel_authentication` enabled. Disable or adjust Vercel Authentication in Vercel Project Settings when ready to open public access.
3. **Interactive smoke check:** Register/activate a test account, verify Gmail SMTP delivery, test 10 MB Cloudinary upload, and verify `ops:retry-notifications` / `pg_dump` backups per [deployment-and-recovery.md](file:///e:/Code/harness-project/docs/runbooks/deployment-and-recovery.md).
