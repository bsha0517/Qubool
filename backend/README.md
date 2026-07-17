# Qubool — Backend

Node.js/Express + PostgreSQL (via Prisma) API for the Qubool matchmaking app,
plus Socket.io for real-time chat.

## Stack
- **Express** — REST API
- **PostgreSQL + Prisma** — database & ORM
- **Socket.io** — real-time messaging
- **JWT** — auth (phone OTP based, no passwords)
- **Zod** — request validation

## Quickstart with Docker Compose (Postgres + Redis + API in one command)

```bash
cd backend
docker compose up --build
```

This starts Postgres, Redis, and the API together, runs migrations
automatically on boot, and exposes the API at `http://localhost:4000`.
Dev fallbacks (console-logged OTP, auto-passing KYC, regex-only chat
moderation) are active out of the box via `.env.docker` — no external
vendor credentials required to try it locally.

To seed sample profiles once it's running:

```bash
docker compose exec api npm run seed
```

To stop everything (keeping data): `docker compose stop`
To stop and wipe the database: `docker compose down -v`

## 1. Setup (without Docker)

```bash
cd backend
npm install
cp .env.example .env   # then fill in DATABASE_URL, JWT_SECRET, Twilio creds
```

You need a running Postgres instance. Easiest local option:

```bash
docker run --name qubool-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=qubool -p 5432:5432 -d postgres:16
```

Then set `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/qubool"` in `.env`.

## 2. Create the database schema

```bash
npx prisma migrate dev --name init
npx prisma generate
```

## 3. (Optional) seed sample profiles

```bash
npm run seed
```

## 4. Run the server

```bash
npm run dev     # nodemon, auto-restart
# or
npm start
```

Server runs on `http://localhost:4000`. Check `GET /health`.

## Auth flow (no passwords)

1. `POST /auth/otp/request` `{ phone: "+923001234567" }` → sends a 6-digit code (logged to console in dev, since no SMS provider is wired up yet)
2. `POST /auth/otp/verify` `{ phone, code }` → returns a JWT
3. Send `Authorization: Bearer <token>` on all subsequent requests

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Send OTP |
| POST | `/auth/otp/verify` | Verify OTP, get JWT |
| POST | `/profile` | Create profile |
| PATCH | `/profile` | Update profile |
| GET | `/profile/me` | Get own profile |
| POST | `/profile/photos` | Attach a photo URL |
| GET | `/discover` | Today's curated match batch |
| POST | `/discover/action` | Like or pass on a profile |
| GET | `/matches` | List active matches |
| GET | `/matches/:id/messages` | Chat history |
| POST | `/matches/:id/messages` | Send a message |
| POST | `/matches/:id/unmatch` | Unmatch |
| POST | `/guardian/invite` | Invite a guardian (ward-initiated) |
| DELETE | `/guardian/:linkId` | Revoke guardian access |
| GET | `/guardian/wards` | Guardian's view of linked wards |
| POST | `/reports` | Report a user |
| GET/PATCH | `/admin/reports` | Moderation queue (admin only) |

## Real-time chat (Socket.io)

Client connects with `io(URL, { auth: { token: jwt } })`, then:
- emits `match:join` with a matchId to receive `message:new` events in that room
- emits `typing` for live typing indicators
- new messages sent via `POST /matches/:id/messages` are broadcast to the room automatically

## Now implemented

- **SMS provider** — `src/services/sms.js` wraps Twilio (falls back to console logging if unconfigured, for local dev). Swap internals for a local Pakistani gateway if preferred.
- **CNIC/ID verification** — `src/services/idVerification.js` + `src/routes/verification.js`. Submits CNIC + selfie to a KYC provider, never stores the raw CNIC (only `cnicHash`), tracks status via `IdVerification` model, blocks duplicate accounts using the same CNIC.
- **Real photo upload** — `src/services/uploads.js` issues short-lived S3 signed URLs so clients upload directly to storage (`POST /uploads/signed-url`); backend never proxies image bytes.
- **Image moderation** — `src/services/imageModeration.js` uses AWS Rekognition to screen photos for explicit/violent content before they're ever shown in discovery (`moderationStatus` gates visibility) and to face-match CNIC photo vs. liveness selfie.
- **Admin role system** — `adminRole` field on `User` (`NONE` / `MODERATOR` / `SUPER_ADMIN`), enforced server-side in `routes/admin.js`; moderators review reports/photos/ID verifications, super-admins can grant/revoke roles.
- **Real content classifier** — `src/utils/moderation.js` layers a fast local regex pre-filter with a call to a hosted moderation API; high-severity flags (threats, sexual content involving minors, self-harm intent) auto-file a report for immediate human review.
- **Redis-backed rate limiting** — `src/config/redis.js` + `rate-limit-redis`, so limits hold up across multiple server instances instead of resetting per-process.
- **PECA 2016 / data residency** — see `COMPLIANCE_BRIEFING.md`. This is a briefing document to bring to actual Pakistani legal counsel, not a substitute for one.

## Remaining TODOs before a real launch

- Move photo moderation to a background queue (SQS/BullMQ) once upload volume makes the current inline call too slow
- Wire actual KYC/SMS/moderation vendor credentials — all three currently have working dev fallbacks but need real accounts
- Decide final hosting region based on legal counsel's answer on data residency
- Add data retention/deletion policies (nothing currently auto-expires: chat logs, rejected verifications, banned-user records)
- Get the actual legal review — `COMPLIANCE_BRIEFING.md` only prepares the questions

## Database schema

See `prisma/schema.prisma` for the full model. Highlights:
- `User` (auth/verification) is separate from `Profile` (public-facing data) — keeps sensitive auth fields out of anything ever exposed to matches
- `MatchAction` records every like/pass; a `Match` is only created when both sides have a `LIKE` row pointing at each other
- `GuardianLink` is ward-initiated and ward-revocable at any time; guardians only ever get match *counts*, never message content, unless a ward explicitly shares something
- `Report` + `admin.js` give a minimal moderation queue to start from
