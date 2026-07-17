# Deployment Guide

Qubool is split into two independent deployments:

- **`frontend/`** — a static Vite build → **Vercel**
- **`backend/`** — a long-running Express + Socket.io + Postgres + Redis
  server → **Railway** or **Render** (needs a persistent process, which
  Vercel's serverless Node runtime doesn't provide — that's what caused the
  original build error)

Deploy the backend first, since the frontend needs its URL.

---

## 1. Deploy the backend (Railway — recommended, fastest path)

1. **Push this repo to GitHub** if it isn't already there.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select this repo.
3. When asked for the service's root, set it to **`backend`** (Railway calls this the service's "Root Directory" in its settings — Settings → General → Root Directory).
4. Railway will detect `backend/Dockerfile` (via `backend/railway.json`) and build from it automatically.
5. **Add a Postgres database**: in the project canvas, click **+ New** → **Database** → **PostgreSQL**. Railway automatically injects `DATABASE_URL` into your backend service — no manual copying needed.
6. **Add Redis**: **+ New** → **Database** → **Redis**. Same thing — `REDIS_URL` gets injected automatically.
7. **Set the remaining environment variables** on the backend service (Settings → Variables). At minimum:
   ```
   JWT_SECRET=<generate a long random string>
   JWT_EXPIRES_IN=30d
   NODE_ENV=production
   CORS_ORIGIN=<your Vercel frontend URL, added after step 2 below>
   ```
   Everything else in `backend/.env.example` (Twilio, AWS, KYC provider, moderation API) is optional — the app has working dev fallbacks for all of them (see `backend/BUG_AUDIT.md`), so you can launch without any of those accounts and add real ones later.
8. Deploy. Railway will run `npx prisma migrate deploy && node src/server.js` automatically (this is baked into `backend/Dockerfile`).
9. Once it's live, copy the public URL Railway gives you (something like `https://qubool-api-production.up.railway.app`) — you'll need it for the frontend.
10. (Optional) Seed sample profiles once: open the service's shell in Railway (Settings → the "..." menu → "Open Shell", or use the Railway CLI: `railway run npm run seed`).

### Alternative: Render

A `render.yaml` blueprint is included at the repo root if you'd rather use Render:

1. Go to [render.com](https://render.com) → **New** → **Blueprint** → connect this repo. Render will read `render.yaml` and offer to create the API service, a Postgres database, and Redis together.
2. After it provisions, go to the `qubool-api` service → **Environment** and set `CORS_ORIGIN` to your Vercel URL (this one field is intentionally left blank in the blueprint since it depends on step 2 below).
3. Add any of the optional vendor env vars (Twilio/AWS/KYC/moderation) the same way, if/when you have real credentials.
4. Render builds from `backend/Dockerfile`, same as Railway.

---

## 2. Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import this same GitHub repo.
2. **This is the step that fixes the original error**: in the import screen (or afterward in **Settings → General → Root Directory**), set the **Root Directory** to **`frontend`**. This tells Vercel to treat only the frontend as the project — it will no longer see or try to build the Express backend at all.
3. Vercel should auto-detect the Vite framework from `frontend/vercel.json` and `frontend/package.json`. Build settings should show:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   (These are already set in `frontend/vercel.json`, so you shouldn't need to touch them.)
4. **Add an environment variable**: `VITE_API_URL` = the backend URL from step 1.9 above (e.g. `https://qubool-api-production.up.railway.app`).
5. Deploy. Vercel gives you a URL like `https://qubool.vercel.app`.

---

## 3. Connect the two

Go back to your backend (Railway or Render) and set:
```
CORS_ORIGIN=https://qubool.vercel.app
```
(use your actual Vercel URL). Redeploy the backend so the new CORS setting takes effect. Without this, the browser will block requests from the frontend to the API.

---

## 4. Verify it's working

1. Open your Vercel URL.
2. Enter a Pakistani-format phone number.
3. Since no SMS provider is configured yet, check the backend's logs (Railway/Render dashboard → Logs) for the OTP code — it's console-logged in the dev fallback.
4. Complete onboarding. Photo upload will use the local-disk fallback (see `backend/BUG_AUDIT.md`, fix #2) unless you've configured AWS — this works but isn't durable across backend restarts/redeploys, so it's worth setting up real S3 + Rekognition before onboarding real users.

---

## Going further (production readiness)

- Add real credentials for Twilio (SMS), AWS S3 + Rekognition (photos), and a KYC provider (CNIC verification) — see `backend/.env.example` for the full list.
- Point `S3_BUCKET_NAME`/AWS credentials at a real bucket before relying on photo uploads long-term; the local-disk fallback doesn't survive redeploys.
- Review `backend/COMPLIANCE_BRIEFING.md` with actual Pakistani legal counsel before launching to real users — PECA 2016 and data residency questions are outlined there.
- Consider a custom domain on both Vercel and Railway/Render once you're past testing.
