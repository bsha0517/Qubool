# Bug Audit — July 2026

> **Note (post-pivot):** this audit was written when the app was a
> matrimonial-focused product ("Qubool") with guardian mode and CNIC/ID
> verification. Both features were removed in the later pivot to Dosti, a
> general dating/friendship app. Entries below that reference those features
> (guardian mode, CNIC, KYC) describe bugs in code that no longer exists —
> kept here as historical record, not as current state. See
> `README.md`/`backend/README.md` for what's actually in the app now.

A full pass through every backend route/service/middleware and frontend
component. Findings below, in order fixed (most severe first). All fixes are
already applied in this codebase.

## Fixed

1. **No async error handling anywhere in the backend.** Express 4 doesn't
   forward rejected promises from `async (req, res) => {}` handlers to the
   error middleware — an unhandled rejection could crash the entire process
   on a single bad request (e.g. updating a deleted record). Fixed by adding
   `express-async-errors`, required at the top of `app.js` before anything
   else touches Express, plus a smarter error handler that translates common
   Prisma errors (`P2025` not-found, `P2002` unique conflict) into proper
   4xx responses instead of falling through to a raw 500.

2. **Photo/ID moderation had no dev fallback, silently blocking onboarding.**
   `services/imageModeration.js` and `services/uploads.js` called AWS
   directly with no "is this configured?" check — unlike `sms.js` and
   `idVerification.js`, which already had fallbacks. Since the default
   `docker-compose` setup has no AWS credentials, every photo upload failed,
   got caught, and was marked REJECTED — but onboarding requires at least
   one PASSED photo to continue, so no one could ever finish signup out of
   the box. Fixed: both services now detect missing AWS config and fall
   back to local behavior (auto-pass moderation; local-disk storage served
   back over HTTP instead of S3), matching the pattern the other services
   already used. Real AWS credentials still take over automatically the
   moment they're set.

3. **`requireVerification` middleware didn't match the real enum.** It used
   an ordered array of only 3 values, but the schema has 5
   (`ID_PENDING`, `REJECTED` were added after this middleware was written).
   A user mid-ID-verification or whose ID check failed got treated as
   *less* verified than an unverified user (`indexOf` returned -1), and was
   incorrectly blocked from messaging — even though messaging only ever
   required phone verification, unrelated to ID status. Fixed with an
   explicit level map instead of array position.

4. **Re-matching after an unmatch silently failed.** The match `upsert` in
   `discover.js` had an empty `update: {}` clause — if two people unmatched
   and later liked each other again, the existing row stayed `UNMATCHED`
   forever. Fixed to reset `status`/`matchedAt`/`unmatchedAt` on the
   update path.

5. **Regex precedence bug in chat content screening.**
   `/\beasypaisa|jazzcash\b.*\bsend\b/i` — because `|` has the lowest
   precedence in regex, this actually meant "easypaisa" OR "jazzcash
   followed by send", not "(easypaisa or jazzcash) followed by send". Any
   message mentioning "easypaisa" in any context got flagged; "jazzcash"
   needed the fuller pattern. Fixed with explicit grouping:
   `/\b(?:easypaisa|jazzcash)\b.*\bsend\b/i`.

6. **Private CNIC/selfie uploads produced unfetchable URLs.** Non-public
   uploads returned an `s3://bucket/key` URI as the "public" URL, which then
   got sent straight to a third-party KYC provider — not fetchable by an
   external HTTP API. Fixed to generate a signed GET URL for private objects
   instead.

7. **Prisma's engine crashed on Alpine at deploy time** (surfaced on Render
   as `Could not parse schema engine response: SyntaxError: Unexpected
   token 'E', "Error load"... is not valid JSON`, preceded by repeated
   `Prisma failed to detect the libssl/openssl version` warnings). Alpine's
   musl libc + minimal OpenSSL isn't reliably detected by Prisma's engine
   binaries — the engine crashes on startup and prints a plain-text error
   instead of the JSON Prisma expects, which then fails to parse and looks
   like a totally unrelated error. Fixed by switching `backend/Dockerfile`
   from `node:20-alpine` to `node:20-slim` (Debian-based) with `openssl`
   installed explicitly via `apt-get` — Prisma supports Debian's OpenSSL
   setup much more reliably than Alpine's.

8. **Supabase's direct connection string is IPv6-only, breaking deploys on
   IPv4-only hosts.** After fixing #7, migrations still failed with
   `P1001: Can't reach database server at db.xxxxx.supabase.co:5432` — not
   because the database was down, but because Supabase's direct-connection
   hostname resolves over IPv6 only by default, and Render's (and most
   PaaS providers') outbound networking is IPv4-only. Documented the fix in
   `DEPLOYMENT.md`: use Supabase's **Session pooler** connection string
   instead (still port `5432`, but a `pooler.supabase.com` host that
   resolves over IPv4 and still supports the DDL Prisma's migrations need,
   unlike the transaction-mode pooler on port `6543`).

9. **`rate-limit-redis` imported incorrectly.** `app.js` did
   `const RedisStore = require("rate-limit-redis")` (default import), but
   v4 of that package only exports `RedisStore` as a **named** export —
   crashed the whole process on boot with `TypeError: RedisStore is not a
   constructor`. Fixed to `const { RedisStore } = require("rate-limit-redis")`.

10. **A malformed `REDIS_URL` (stray quote marks pasted in from the
    dashboard) crashed the entire process**, not just Redis-dependent
    features. The literal quotes broke ioredis's URL parsing, it fell back
    to treating the string as a socket path, and once retries were
    exhausted the resulting rejection was never caught — taking down every
    user's request, not just rate limiting. Fixed two ways: (a)
    `config/redis.js` now strips wrapping quotes/whitespace from
    `REDIS_URL` before use, so this specific copy-paste mistake can't
    happen again, and (b) added a process-level `unhandledRejection`
    handler in `server.js` that logs and keeps running instead of crashing,
    as a safety net for whatever the next unexpected one turns out to be.
    This isn't a substitute for fixing bugs — it's there so a bug in one
    subsystem (Redis, in this case) doesn't take the entire API down with it.

11. **Photo upload's dev fallback pointed at `localhost` in every real
    deployment, not just local Docker.** `services/uploads.js` built the
    local-disk fallback's upload URL from a `SELF_BASE_URL` env var that
    defaulted to `http://localhost:${PORT}` — correct for local Docker
    Compose, but on Render (or anywhere else) nothing ever set that env var
    to the real public URL, so the browser was asked to `PUT` the photo to
    the *user's own machine*, which obviously has nothing listening there —
    surfaced as "Failed to fetch" on the frontend. Fixed at the source
    instead of just documenting one more env var to remember: the route
    (`routes/uploads.js`) now derives the base URL from the actual incoming
    request (`req.protocol` + `req.get("host")`) and passes it down, so it's
    automatically correct wherever the API happens to be running.
    `SELF_BASE_URL` still works as an explicit override if you ever want
    uploads served from a different domain than the API itself. This also
    required adding `app.set("trust proxy", 1)` in `app.js`, since without
    it `req.protocol` would report `http` even behind Render's `https`
    edge — that setting also fixes rate-limiting's client-IP detection,
    which had the same underlying blind spot.

## Fixed while adding email/password auth

12. **`POST /auth/otp/verify` always returned `hasProfile: false`, even for
    returning users who already had a completed profile.** The frontend's
    initial-load check (`GET /profile/me` on token presence) papered over
    this on page refresh, but a user who verified their phone again mid-session
    (e.g. re-logging-in) got forced back through onboarding every time. Fixed
    to actually check for an existing profile and return the real value —
    same fix applied to the new `/auth/login` endpoint from the start.

## Noted but not changed (design tradeoffs, not bugs)

- **`GuardianInvite`'s "invited this session" list** only tracks invites
  made in the current browser session, not a real list from the backend.
  There's no `GET` endpoint for "guardians I've invited" yet — would need
  a small backend addition if that's wanted.
- **Guardian invite creates a placeholder `User` row** for a guardian's
  phone number if they've never signed up, with no verification. This
  is intentional (so the invite can be sent before the guardian has an
  account) but means an unverified shadow account can be created for any
  phone number by anyone who wants to invite it as a guardian — worth
  knowing about from an abuse-potential standpoint even if it isn't
  incorrect behavior.
- **Chat's optimistic-update comment was misleading** (claimed the sender's
  own message is appended from the POST response; it isn't — it actually
  arrives back via the Socket.io room echo, since the sender is joined to
  their own match room). Functionally fine, but worth knowing the message
  appears via a round trip rather than instantly. Not fixed since it works
  correctly, just noting the comment overstated what the code does.
- **Email/password accounts have no email verification link.** Signup only
  confirms someone knows a valid-looking email format + chose a password —
  it doesn't confirm they control that inbox. `emailVerified` exists on the
  `User` model for exactly this future addition, currently always `false`.
  Not a bug — just not built yet, since it needs a real email-sending
  provider wired up (parallel to how `sms.js` wraps Twilio).
