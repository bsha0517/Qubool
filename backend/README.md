# Dosti — Backend

Node.js/Express + PostgreSQL (via Prisma) API for Dosti, a general dating
and friendship app, plus Socket.io for real-time chat.

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
Dev fallbacks (console-logged OTP, regex-only chat moderation) are active
out of the box via `.env.docker` — no external vendor credentials required
to try it locally.

To seed sample profiles once it's running (12 demo profiles with photos):

```bash
docker compose exec api npm run seed
```

Since matches require mutual likes and seed profiles are static, they won't
like you back on their own — re-run with your own phone/email to make them
do so, so swiping right on one produces a real match to test chat with:

```bash
docker compose exec -e AUTO_LIKE_PHONE=+923001234567 api npm run seed
# or: docker compose exec -e AUTO_LIKE_EMAIL=you@example.com api npm run seed
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
docker run --name dosti-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dosti -p 5432:5432 -d postgres:16
```

Then set `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dosti"` in `.env`.

## 2. Create the database schema

Migrations already exist at `prisma/migrations/` (hand-written to match
`schema.prisma` — see the note at the top of the first one). Apply them:

```bash
npx prisma migrate deploy
npx prisma generate
```

If you ever change `schema.prisma` going forward, generate a new migration
the normal way instead of hand-editing SQL:

```bash
npx prisma migrate dev --name <describe-the-change>
```

This diffs your schema against the existing migrations and only creates a
new one for whatever changed.

## 3. (Optional) seed sample profiles

```bash
npm run seed
```

Adds 12 demo profiles with photos. To make them like you back (needed for
an actual match, since matches require mutual likes and these are static
accounts), re-run with your own phone/email:

```bash
AUTO_LIKE_PHONE=+923001234567 npm run seed
```

## 4. Run the server

```bash
npm run dev     # nodemon, auto-restart
# or
npm start
```

Server runs on `http://localhost:4000`. Check `GET /health`.

## Auth flow

Two independent ways to get an account — a user can have a phone, an email
+ password, or both:

**Phone (OTP, no password):**
1. `POST /auth/otp/request` `{ phone: "+923001234567" }` → sends a 6-digit code (logged to console in dev, since no SMS provider is wired up yet)
2. `POST /auth/otp/verify` `{ phone, code }` → returns a JWT (also works as "login" for a returning phone user — same endpoint)

**Email + password:**
1. `POST /auth/signup` `{ email, password }` → creates the account, returns a JWT
2. `POST /auth/login` `{ email, password }` → returns a JWT for a returning user

Either way: send `Authorization: Bearer <token>` on all subsequent requests.

Note: email/password accounts skip phone verification, so anything gated
specifically on `PHONE_VERIFIED` (see `middleware/auth.js`'s
`requireVerification`) won't apply to them. Actions that just need "not an
anonymous/unverified account" (like sending messages) use the broader
`requireVerifiedAccount` instead, which accepts either phone OTP or
email+password as sufficient.

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Send OTP |
| POST | `/auth/otp/verify` | Verify OTP, get JWT |
| POST | `/auth/signup` | Create account with email + password |
| POST | `/auth/login` | Log in with email + password |
| POST | `/profile` | Create profile |
| PATCH | `/profile` | Update profile |
| GET | `/profile/me` | Get own profile |
| POST | `/profile/photos` | Attach a photo URL |
| DELETE | `/profile/photos/:id` | Remove a photo |
| PATCH | `/profile/photos/reorder` | Reorder photos (first = main photo) |
| PUT | `/profile/prompts` | Replace profile prompts (max 3) |
| GET | `/discover` | Today's curated match batch |
| GET | `/discover/likes-received` | Who liked you, not yet responded to |
| POST | `/discover/action` | Like or pass on a profile |
| POST | `/discover/undo` | Undo the last like/pass |
| GET | `/matches` | List active matches |
| GET | `/matches/:id/messages` | Chat history |
| POST | `/matches/:id/messages` | Send a message |
| POST | `/matches/:id/unmatch` | Unmatch |
| POST | `/reports` | Report a user |
| GET/PATCH | `/admin/reports` | Moderation queue (admin only) |

## Real-time chat (Socket.io)

Client connects with `io(URL, { auth: { token: jwt } })`, then:
- emits `match:join` with a matchId to receive `message:new` events in that room
- emits `typing` for live typing indicators
- new messages sent via `POST /matches/:id/messages` are broadcast to the room automatically

## Now implemented

- **SMS provider** — `src/services/sms.js` wraps Twilio (falls back to console logging if unconfigured, for local dev). Swap internals for a local Pakistani gateway if preferred.
- **Real photo upload** — `src/services/uploads.js` issues short-lived S3 signed URLs so clients upload directly to storage (`POST /uploads/signed-url`); backend never proxies image bytes.
- **Image moderation** — `src/services/imageModeration.js` uses AWS Rekognition to screen photos for explicit/violent content before they're ever shown in discovery (`moderationStatus` gates visibility).
- **Admin role system** — `adminRole` field on `User` (`NONE` / `MODERATOR` / `SUPER_ADMIN`), enforced server-side in `routes/admin.js`; moderators review reports/photos, super-admins can grant/revoke roles.
- **Real content classifier** — `src/utils/moderation.js` layers a fast local regex pre-filter with a call to a hosted moderation API; high-severity flags (threats, sexual content involving minors, self-harm intent) auto-file a report for immediate human review.
- **Redis-backed rate limiting** — `src/config/redis.js` + `rate-limit-redis`, so limits hold up across multiple server instances instead of resetting per-process.

## Remaining TODOs before a real launch

- Move photo moderation to a background queue (SQS/BullMQ) once upload volume makes the current inline call too slow
- Wire actual SMS/moderation vendor credentials — both currently have working dev fallbacks but need real accounts
- Add data retention/deletion policies (nothing currently auto-expires: chat logs, banned-user records)
- Verifying age/identity is currently just phone verification — no ID check happens anymore since CNIC/KYC verification was removed in the pivot to a general dating app. If stronger identity assurance ever matters again, that's a deliberate re-add, not something quietly missing.

## Database schema

See `prisma/schema.prisma` for the full model. Highlights:
- `User` (auth/verification) is separate from `Profile` (public-facing data) — keeps sensitive auth fields out of anything ever exposed to matches
- `MatchAction` records every like/pass; a `Match` is only created when both sides have a `LIKE` row pointing at each other
- `Report` + `admin.js` give a minimal moderation queue to start from
