# Deployment Guide

Qubool is split into two independent deployments:

- **`frontend/`** — a static Vite build → **Vercel**
- **`backend/`** — a long-running Express + Socket.io server → **Render**
  (needs a persistent process, which Vercel's serverless Node runtime
  doesn't provide — that's what caused the original build error), plus
  **Supabase** (Postgres) and **Upstash** (Redis)

This combination is entirely free — no credit card required anywhere —
though Render's free tier spins the backend down after 15 minutes of
inactivity (it wakes back up on the next request, with a ~30 second cold
start). If that cold start matters to you later, Render's paid tier removes
it; everything below still works identically either way.

Deploy the databases first, then the backend, then the frontend.

---

## 1. Set up Postgres (Supabase, free, no card, no expiry)

1. Go to [supabase.com](https://supabase.com) → sign up → **New project**.
2. Pick a name, a database password (save it), and a region close to your
   users (Singapore or Frankfurt are usually the closest options to
   Pakistan).
3. Once it's provisioned: **Project Settings → Database → Connection string**.
   Copy the **URI** format connection string. It looks like:
   ```
   postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with the password from step 2. This is your `DATABASE_URL`.

## 2. Set up Redis (Upstash, free, no card)

1. Go to [upstash.com](https://upstash.com) → sign up → **Create database**.
2. Pick a region close to your Render region (see step 3 below — matching
   regions keeps latency down).
3. On the database's detail page, copy the **`rediss://` connection string**
   under "Connect" (make sure it's the `rediss://` — TLS — one, not the
   REST API URL). This is your `REDIS_URL`.

## 3. Deploy the backend (Render, free tier, no card)

1. **Push this repo to GitHub** if it isn't already there.
2. Go to [render.com](https://render.com) → sign up → **New** → **Blueprint**.
3. Connect this GitHub repo. Render reads `render.yaml` at the repo root
   and proposes creating the `qubool-api` web service on the **free** plan.
4. Before/after creating it, set these environment variables on the
   `qubool-api` service (**Environment** tab):
   ```
   DATABASE_URL=<your Supabase connection string from step 1>
   REDIS_URL=<your Upstash connection string from step 2>
   JWT_SECRET=<Render can auto-generate this — see render.yaml>
   JWT_EXPIRES_IN=30d
   NODE_ENV=production
   CORS_ORIGIN=<your Vercel URL — comes from step 4 below, add this after>
   ```
   Everything else in `backend/.env.example` (Twilio, AWS, KYC provider,
   moderation API) is optional — the app has working dev fallbacks for all
   of them (see `backend/BUG_AUDIT.md`), so you can launch without any of
   those accounts and add real ones later.
5. Deploy. Render builds from `backend/Dockerfile`, which runs
   `npx prisma migrate deploy` automatically before starting the server, so
   your Supabase database gets its schema set up on first deploy.
6. Once it's live, copy the public URL Render gives you (something like
   `https://qubool-api.onrender.com`) — you'll need it for the frontend.
7. (Optional) Seed sample profiles once: **Shell** tab on the Render
   service → `npm run seed`.

### Note on Render's free tier

The free web service **sleeps after 15 minutes with no traffic** and takes
roughly 20–30 seconds to wake up on the next request. For testing/demo use
this is a fine tradeoff for $0. If it ever bothers you, Render's cheapest
paid tier ($7/mo at time of writing) removes the sleep — nothing else about
this setup needs to change to upgrade later.

### Alternative: Railway (if you don't mind paying)

If you'd rather pay for Railway's convenience (built-in Postgres/Redis,
no sleep), `backend/railway.json` is already set up for it — see the
previous version of this guide's Railway section, or just: New Project →
Deploy from GitHub → set Root Directory to `backend` → add Postgres +
Redis plugins → set env vars → deploy.

---

## 4. Deploy the frontend (Vercel, free)

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import this same GitHub repo.
2. **This is the step that fixes the original error**: in the import screen (or afterward in **Settings → General → Root Directory**), set the **Root Directory** to **`frontend`**. This tells Vercel to treat only the frontend as the project — it will no longer see or try to build the Express backend at all.
3. Vercel should auto-detect the Vite framework from `frontend/vercel.json` and `frontend/package.json`. Build settings should show:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   (These are already set in `frontend/vercel.json`, so you shouldn't need to touch them.)
4. **Add an environment variable**: `VITE_API_URL` = the backend URL from step 3.6 above (e.g. `https://qubool-api.onrender.com`).
5. Deploy. Vercel gives you a URL like `https://qubool.vercel.app`.

---

## 5. Connect the two

Go back to Render → `qubool-api` → **Environment** and set:
```
CORS_ORIGIN=https://qubool.vercel.app
```
(use your actual Vercel URL). Save — Render redeploys automatically. Without
this, the browser will block requests from the frontend to the API.

---

## 6. Verify it's working

1. Open your Vercel URL. (First load may take ~20-30s if the Render backend
   was asleep — that's the free-tier cold start, not a bug.)
2. Enter a Pakistani-format phone number.
3. Since no SMS provider is configured yet, check the backend's logs
   (Render dashboard → Logs) for the OTP code — it's console-logged in the
   dev fallback.
4. Complete onboarding. Photo upload will use the local-disk fallback (see
   `backend/BUG_AUDIT.md`, fix #2) unless you've configured AWS — this works
   but doesn't survive Render restarts/redeploys on the free tier (the
   filesystem is ephemeral), so it's worth setting up real S3 + Rekognition
   before onboarding real users.

---

## Going further (production readiness)

- Add real credentials for Twilio (SMS), AWS S3 + Rekognition (photos), and a KYC provider (CNIC verification) — see `backend/.env.example` for the full list.
- Point `S3_BUCKET_NAME`/AWS credentials at a real bucket before relying on photo uploads long-term; the local-disk fallback doesn't survive redeploys, and is even more ephemeral on Render's free tier than elsewhere.
- Review `backend/COMPLIANCE_BRIEFING.md` with actual Pakistani legal counsel before launching to real users — PECA 2016 and data residency questions are outlined there.
- Consider a custom domain on both Vercel and Render once you're past testing.
- If Render's cold start or Supabase/Upstash's free-tier limits ever become
  a real constraint, upgrading any one of the three is independent of the
  others — nothing about this architecture locks you in.

