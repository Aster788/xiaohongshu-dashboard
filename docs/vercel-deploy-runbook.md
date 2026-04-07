# Vercel Deployment Runbook

This runbook covers production deployment for the dashboard on Vercel with Neon Postgres + Prisma.

## 1) Required environment variables

Production currently needs exactly these keys:

- `DATABASE_URL`
- `UPLOAD_SECRET`

Why these are the only required keys in Step 2 / production setup:

- `prisma/schema.prisma` and `prisma.config.ts` read `DATABASE_URL`.
- `lib/auth/uploadSecret.ts` reads `UPLOAD_SECRET`.
- No runtime code currently reads `DIRECT_URL`, `NEXT_PUBLIC_*`, or other deployment-only keys.

Do not commit real values. Keep local development values in `.env.local`. Keep Vercel values in Project Settings only.

## 2) Neon connection

Use the Neon connection string as `DATABASE_URL`.

Recommended source:

1. Open Neon project.
2. Copy the Postgres connection string from the Neon dashboard.
3. Prefer the pooled/serverless endpoint for the app runtime unless your team has a different database policy.
4. Paste that full URI into Vercel as `DATABASE_URL`.

Notes:

- Prisma in this repo is configured to read a single `DATABASE_URL`; do not add undocumented extra keys unless code is updated to consume them.
- Local Prisma CLI and local app runtime both support `.env.local` via `prisma.config.ts` and the `dotenv -c development` npm scripts.
- Neon SSL parameters should stay in the copied URI; do not strip them.

## 3) Vercel project setup

Set these in Vercel Project Settings -> Environment Variables:

- `DATABASE_URL`: Neon production connection string
- `UPLOAD_SECRET`: long random string for upload-related APIs

Current protected routes that use `UPLOAD_SECRET`:

- `POST /api/upload`
- `POST /api/excel/parse`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/notes`
- `PATCH /api/notes/:id`

## 4) Function/runtime settings

Current server-side route settings:

- `app/api/upload/route.ts`: Node runtime, `maxDuration = 60`
- `app/api/settings/route.ts`: Node runtime, `maxDuration = 30`
- `app/api/excel/parse/route.ts`: Node runtime, `maxDuration = 30`

The matching Vercel function limits are declared in `vercel.json`.

If uploads time out in production, split large imports into smaller files before raising limits further.

## 5) Deployment steps

1. Push the branch and create a Vercel deployment.
2. Confirm `DATABASE_URL` and `UPLOAD_SECRET` are set for the target environment.
3. Run Prisma migrations against production:
   - `npx prisma migrate deploy`
4. Redeploy if needed so the app starts against the latest schema and env values.
5. Run the smoke tests below.

## 6) Smoke test checklist

Replace placeholders first:

- `<APP_URL>`: deployed Vercel URL
- `<UPLOAD_SECRET>`: production shared secret
- `<FILE.xlsx>`: a real workbook exported in the supported format

Browser checks:

- Open `/` and confirm KPI cards, charts, and Top 10 render.
- Open `/?year=2026&sort=views` and confirm filtered content still renders.
- Confirm the public home page does not expose an `/upload` navigation entry.
- Confirm logo path `/caser-logo-01.png` loads normally.

HTTP checks (PowerShell):

```powershell
curl.exe -i "<APP_URL>/api/settings"
```

Expected:

- `401 Unauthorized` when `UPLOAD_SECRET` is configured.

```powershell
curl.exe -i -X PUT "<APP_URL>/api/settings" `
  -H "Authorization: Bearer <UPLOAD_SECRET>" `
  -H "Content-Type: application/json" `
  --data "{\"followers\":123,\"totalPosts\":45,\"likesAndSaves\":678,\"launchDate\":\"2025-06-15\"}"
```

Expected:

- `200 OK`
- JSON echoes the updated KPI values

```powershell
curl.exe -i -X POST "<APP_URL>/api/upload" `
  -H "Authorization: Bearer <UPLOAD_SECRET>" `
  -F "files[]=@<FILE.xlsx>"
```

Expected:

- `200 OK` for a valid workbook
- Response includes `inserted`, `updated`, `untouched`, `summary`

```powershell
curl.exe -i -X GET "<APP_URL>/api/notes?page=1&limit=5" `
  -H "Authorization: Bearer <UPLOAD_SECRET>"
```

Expected:

- `200 OK`
- Response includes `items`, `page`, `limit`, `total`

## 7) Rollback plan

Rollback order should prefer app code first, database second.

### App-only rollback

Use this when the deployment is bad but schema/data are still valid:

1. Promote the previous healthy Vercel deployment or redeploy the last known good commit.
2. Re-run the smoke tests for `/`, `/api/settings`, and `/api/upload`.

### Migration/database rollback

Use extra caution here. Do not run destructive resets in production.

1. Stop new uploads temporarily.
2. Check migration state with `npx prisma migrate status`.
3. If the issue is app/schema mismatch, restore app compatibility first by rolling back the app.
4. If the migration itself is the problem, use your Neon recovery process before changing data:
   - restore from a known-good backup / recovery point, or
   - create a recovery branch from a healthy state and validate there first
5. Redeploy and repeat the smoke tests.

## 8) Local-to-production parity notes

- Local app runtime usually uses `.env.local`.
- `npm run db:*` commands load the same development env file set via `dotenv -c development`.
- This repo currently documents and supports only `DATABASE_URL` + `UPLOAD_SECRET` for deployment parity.
