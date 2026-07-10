# Deploying FaithBrains (free stack)

Target: **Neon** (Postgres + pgvector, free 3 GB) · **Render** (FastAPI backend,
free web service) · **Vercel** (Next.js frontend, free). Total cost: $0/month.
Free-tier caveats: Render sleeps after ~15 min idle (first request wakes it in
~30–60 s); Neon compute autosuspends (first query adds ~1 s).

## 1. Database — Neon

1. Create a project at neon.tech (region close to users; Postgres 17).
2. Copy the connection string and convert it for the app: it must start with
   `postgresql+asyncpg://` and end with `?ssl=require`, e.g.
   `postgresql+asyncpg://USER:PASS@HOST/neondb?ssl=require`
3. Apply schema, then copy the data from the local Docker database:

   ```powershell
   # schema (from backend/, with DATABASE_URL pointing at Neon)
   uv run alembic upgrade head

   # data — dump from the local container, restore into Neon
   docker exec faithbrains-db pg_dump -U faithbrains -d faithbrains `
     --data-only --format=custom -f /tmp/faithbrains.dump
   docker exec faithbrains-db pg_restore --data-only --disable-triggers `
     -d "postgres://USER:PASS@HOST/neondb?sslmode=require" /tmp/faithbrains.dump
   ```

4. Sanity check: `SELECT count(*) FROM quran_verses;` → 6236.

## 2. Backend — Render

1. Dashboard → New + → **Blueprint** → select the GitHub repo
   (`render.yaml` at the repo root defines the service).
2. Fill the prompted env vars: `DATABASE_URL` (the `+asyncpg` Neon URL),
   `OPENAI_API_KEY`, `VOYAGE_API_KEY`, `ADMIN_TOKEN` (long random string),
   `CORS_ORIGINS` (the Vercel URL once known).
3. Deploy. The container runs `alembic upgrade head` on boot, so schema is
   always current. Verify `https://<service>.onrender.com/api/v1/health`.

## 3. Frontend — Vercel

1. vercel.com → Add New Project → import the GitHub repo.
2. Root Directory: `frontend`. Framework preset: Next.js (auto-detected).
3. Environment variable: `BACKEND_URL = https://<service>.onrender.com`
   (used by both the server-side API client and the `/api/v1` rewrite proxy).
4. Deploy, then add the final Vercel URL to Render's `CORS_ORIGINS`.

## Ongoing

- **Re-deploys**: push to `main` — Render and Vercel both auto-deploy.
- **Embedding jobs** run from any machine against Neon:
  `DATABASE_URL=<neon> uv run python -m app.ingest.embed` (resumable).
- **Licensing gate**: hadith English translation rights must be cleared before
  a public launch (docs/licensing.md). Private beta is fine.
- **Backups**: Neon free keeps ~24h of point-in-time restore; for belt-and-
  braces run `pg_dump` monthly and keep the file somewhere safe.
