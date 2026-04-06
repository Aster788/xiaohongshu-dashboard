# Caser Rednote Dashboard

Next.js app for Xiaohongshu analytics (see `docs/PRD.md`).

**Excel APIs:** `POST /api/excel/parse` is **preview-only** (raw sheet grids). `**POST /api/upload`** ingests PRD-scoped sheets and upserts `Note` / `AccountDaily` (Bearer `UPLOAD_SECRET`).

## Local development

- Run `npm run dev` and **keep that terminal open**. Pressing Ctrl+C or closing the tab stops the server—then the browser shows “refused to connect” until you start it again.
- If port **3000** is busy, Next.js picks another port (e.g. **3002**). Open the **exact URL** printed after `Local:`. To pin port 3002: `npm run dev:3002`.

## Production environment variables

Configure these in your host (e.g. Vercel **Settings → Environment Variables**). Do **not** commit real values; use `.env.local` locally only (see `.env.example`).


| Variable        | Required             | Purpose                                                                                                                                                                                            |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`  | **Yes**              | PostgreSQL connection string for Prisma (production DB).                                                                                                                                           |
| `UPLOAD_SECRET` | **Yes** (production) | Shared secret for `Authorization: Bearer` on `/api/upload`, `/api/settings`, `/api/excel/parse`. If unset, the app allows unauthenticated access (dev convenience only). Use a long random string. |


**After setting variables:** run migrations against the production database (`npx prisma migrate deploy` or your platform’s documented flow), then redeploy so the app picks up new env values.

**Large uploads:** very big Excel imports may run for many seconds; serverless platforms enforce their own request time limits—if uploads time out in production, increase the function `maxDuration` (where supported) or split imports.