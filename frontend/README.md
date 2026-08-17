# Dosti — Frontend

React (Vite) client wired to the Dosti backend API — real network
calls, no mock data. Covers phone-OTP auth, profile creation, curated daily
matches, liking/passing, matches list, and real-time chat via Socket.io.

## Setup

```bash
npm install
cp .env.example .env   # set VITE_API_URL if the backend isn't on localhost:4000
npm run dev
```

Runs at `http://localhost:5173`. Make sure the backend is running first
(see the backend's own README — `docker compose up --build` is the fastest
way to get Postgres + Redis + API running together).

## How auth works here

1. Enter a phone number → `POST /auth/otp/request`
2. In dev, the backend logs the OTP to its own console (no real SMS
   provider needed locally) — check the backend's terminal/logs for the code
3. Enter the code → `POST /auth/otp/verify` → JWT stored in `localStorage`
4. Token is decoded client-side (not verified, just read) to get the user's
   own ID for aligning chat bubbles — the backend is the source of truth for
   anything security-relevant

## Now built

- **Photo upload** — `src/components/PhotoUpload.jsx`. Onboarding includes a photo step after profile creation; each of up to 3 slots does the full signed-URL → direct-to-storage `PUT` → `registerPhoto` flow, and shows a live moderation status pill (Reviewing / Approved / Rejected) since the backend moderates synchronously on registration.
- **Settings** tab — currently just photo management; a natural place to add more account settings later.

## Known gaps

- **Token storage uses localStorage**, which is readable by any injected
  script (XSS risk). Fine for a prototype; swap for an httpOnly-cookie-based
  session before shipping.

## Structure

```
src/
  api/
    client.js   — fetch wrapper + all endpoint calls
    socket.js   — socket.io-client connection management
  App.jsx       — all screens (onboarding + main app)
  main.jsx      — React entry point
```
