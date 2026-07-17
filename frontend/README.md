# Qubool — Frontend

React (Vite) client wired to the Qubool backend API — real network
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
- **CNIC/ID verification** — `src/components/IdVerification.jsx`. Collects CNIC number + three photos (front/back/selfie), uploads each, submits to `/verification/id`, then polls `/verification/id/status` every 4s while pending.
- **Guardian invite** — `src/components/GuardianInvite.jsx`. Lets a user with guardian mode on invite a guardian by phone via `/guardian/invite`; shows a friendly explainer and disables itself if guardian mode is off.

All three are reachable from a new **Settings** tab (third tab in the main nav), and the photo step also appears once during onboarding, right after profile creation.

## Known gaps

- **Token storage uses localStorage**, which is readable by any injected
  script (XSS risk). Fine for a prototype; swap for an httpOnly-cookie-based
  session before shipping.
- The guardian invite screen doesn't yet show the *list* of already-invited
  guardians (only ones invited this session) — add a `GET` list endpoint on
  the backend if that's needed.

## Structure

```
src/
  api/
    client.js   — fetch wrapper + all endpoint calls
    socket.js   — socket.io-client connection management
  App.jsx       — all screens (onboarding + main app)
  main.jsx      — React entry point
```
