# Deployment and Recovery Runbook

This runbook covers the two-project Vercel deployment topology, secure configuration, database migrations and rollback, email retry operations, and off-provider PostgreSQL backup and restore verification.

## 1. Two-project Vercel topology

Deploy the backend and frontend as two separate Vercel projects from the same repository:

1. **Backend project (`apps/be`)**
   - **Root Directory:** `apps/be`
   - **Build Command:** `npm run build` (configured in `apps/be/vercel.json`)
   - **Routing:** `apps/be/vercel.json` rewrites `/(.*)` to `/api/index` (`apps/be/api/index.mjs`), which delegates to the cached NestJS Express handler in `apps/be/src/vercel.ts`.
   - Deploy the backend first to obtain its deployment URL (`API_ORIGIN`).

2. **Frontend project (`apps/fe`)**
   - **Root Directory:** `apps/fe`
   - **Framework:** Next.js (`apps/fe/vercel.json`)
   - **API Rewrite:** `apps/fe/next.config.ts` rewrites `/api/v1/:path*` to `${API_ORIGIN}/api/v1/:path*`, preserving the browser origin and `HttpOnly` cookies.
   - **Cache Control:** `apps/fe/vercel.json` sets `Cache-Control: no-store, max-age=0` on `/api/v1/(.*)` so private responses are never cached at the edge.

## 2. Isolated Preview and Production configuration

Never share Preview and Production databases, Redis instances, or secrets. Configure environment variables per Vercel environment:

- **Backend (`apps/be`)**
  - `NODE_ENV`: `production` (enables `Secure` cookies)
  - `DATABASE_URL`: Neon PostgreSQL connection string (`?sslmode=require`; use a separate Neon branch/database for Preview)
  - `REDIS_URL`: Upstash Redis TLS URL (`rediss://...`; use a separate Upstash database for Preview)
  - `APP_BASE_URL`: Public HTTPS origin of the frontend project (used in activation links)
  - `CSRF_SECRET` and `JWT_SECRET`: Distinct high-entropy random secrets per environment
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Server-side Cloudinary credentials (use a separate folder/account for Preview if possible)
  - `SMTP_HOST` (`smtp.gmail.com`), `SMTP_PORT` (`465`), `SMTP_USER`, `SMTP_PASS` (Google App Password), `MAIL_FROM`

- **Frontend (`apps/fe`)**
  - `API_ORIGIN`: The corresponding Preview or Production backend URL (no trailing slash)

## 3. Provider operations & proposed thresholds

- **Neon PostgreSQL:** Monitor project storage, compute, and transfer in the Neon console.
  - **PROPOSED setting:** Trigger an early-warning investigation at **70%** of the Neon Free storage allowance (1 GB) before quota exhaustion.
- **Gmail SMTP:** Activation and support emails are attempted immediately on request and recorded in `notification_jobs`. Because Vercel Hobby cron runs at most daily, run the bounded retry CLI after transient SMTP outages:
  ```bash
  npm run build --workspace apps/be
  npm run ops:retry-notifications --workspace apps/be -- --require-smtp
  ```
  Pending activation retries automatically issue a fresh single-use Redis activation token for unactivated accounts.
- **Cloudinary:** Uploads go directly from the browser to Cloudinary using server-signed parameters (10,000,000-byte limit, PNG/JPG/JPEG/WebP), and viewing uses short-lived authenticated URLs. PostgreSQL backups preserve `support_evidence` metadata (`public_id`, `image_url`); Cloudinary image bytes require separate Cloudinary backup/retention management.

## 4. Production migration and rollback

1. **Pre-migration backup:** Always take an off-provider `pg_dump` snapshot before applying new SQL migrations to production.
2. **Apply migrations:**
   ```bash
   npm run build --workspace apps/be
   npm run db:migrate --workspace apps/be
   ```
   `runMigrations` acquires a PostgreSQL advisory lock (`72839104`) and executes each pending `.sql` file inside its own transaction, recording applied versions in `schema_migrations`.
3. **Rollback procedure:**
   - If a migration fails mid-file, its transaction rolls back automatically and `schema_migrations` is untouched.
   - If a deployed schema change causes an application regression after commit:
     1. Pause or revert the Vercel backend deployment to the previous working release.
     2. Prefer a **forward-fix** migration when data has been written since the release.
     3. If a full state rollback is required, restore the pre-migration `pg_dump` into a clean target database using `pg_restore`, verify with `ops:verify-restore`, and switch `DATABASE_URL`.

## 5. Off-provider backup and disposable restore drill

Export PostgreSQL outside Neon using custom format (`-Fc`) and store encrypted backups with restricted access (never in Git):

```bash
pg_dump --format=custom --no-owner --no-privileges --file=backup.dump "$DATABASE_URL"
```

Restore into a separate disposable database and verify schema migrations, tasks, notes, support requests, and image references (`support_evidence`):

```bash
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" backup.dump
npm run ops:verify-restore --workspace apps/be -- --database-url "$RESTORE_DATABASE_URL"
```

## 6. Always-On Backend Option: Railway (Zero NestJS Cold Start)

To eliminate Vercel Function cold starts for NestJS while keeping Next.js (`apps/fe`) on Vercel:

1. **Create a Railway service** from the GitHub repository with **Root Directory** set to `apps/be` and select the **Southeast Asia (Singapore)** region.
2. Railway reads `apps/be/railway.json`:
   - **Build Command:** `npm run build`
   - **Start Command:** `node dist/db/migrate-cli.js --if-env && node dist/main.js` (runs pending migrations on startup, then starts the persistent NestJS server on Railway's `PORT`)
   - **Healthcheck:** `/api/v1/health`
3. **Environment variables on Railway (`apps/be`):**
   - `NODE_ENV=production`
   - `APP_BASE_URL=https://personal-notebook-web.vercel.app`
   - `DATABASE_URL` (Neon PostgreSQL with `?sslmode=verify-full`)
   - `REDIS_URL` (Upstash Redis `rediss://...`)
   - `CSRF_SECRET`, `JWT_SECRET`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
4. **Point Frontend (`apps/fe` on Vercel) to Railway:**
   - Update `API_ORIGIN` in Vercel (`personal-notebook-web`) to the Railway public URL (`https://<service>.up.railway.app`) and redeploy `personal-notebook-web`.
