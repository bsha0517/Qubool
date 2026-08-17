# Dosti

A general dating and friendship app: phone-verified profiles, curated
daily matches (not infinite swipe), blur-until-match photos, and moderated
chat. Choose "Dating" or "Friendship" as your intent — no other filters
gate who you can match with.

```
dosti/
  backend/     Express + PostgreSQL + Redis API (see backend/README.md)
  frontend/    React (Vite) client wired to the API (see frontend/README.md)
  docker-compose.yml   spins up the whole stack together
```

## Run everything with one command

```bash
docker compose up --build
```

This starts, in order: Postgres → Redis → the API (running migrations
automatically) → the web client.

- Frontend: http://localhost:5173
- API: http://localhost:4000 (health check at `/health`)

Everything works out of the box with dev fallbacks — no external vendor
accounts (Twilio, AWS) are required to try the app locally:
- OTP codes are logged to the `dosti-api` container's logs instead of being texted
- Chat moderation runs on the local regex pre-filter only

To seed sample profiles once it's running (12 demo profiles with photos,
spread across cities and both Dating/Friendship):

```bash
docker compose exec api npm run seed
```

## Trying it out

1. Open http://localhost:5173
2. Enter a Pakistani-format number, e.g. `+923001234567`, and complete onboarding
3. Check the OTP in the logs: `docker compose logs api | grep OTP`
4. Run the seed command above (if you haven't) — you'll now see demo profiles in Discover
5. **To actually get a match** (not just see profiles): matches need mutual likes, and the seed profiles are static — they won't like you back on their own. Re-run the seed command with your phone number so they do:
   ```bash
   docker compose exec -e AUTO_LIKE_PHONE=+923001234567 api npm run seed
   ```
   (swap in whatever number you signed up with — or `AUTO_LIKE_EMAIL=you@example.com` if you used email signup instead). Now swiping right on any seed profile matches instantly, so you can try the Matches tab and chat.
6. **If Discover shows "That's today's batch" with nothing in it**: you've already swiped on all the seed profiles in an earlier session — Discover excludes anyone you've already acted on, and re-seeding alone doesn't create new people (it just upserts the same 12). Reset your swipe history against them specifically:
   ```bash
   docker compose exec -e RESET_SWIPES_FOR_PHONE=+923001234567 api npm run seed
   ```
   This only clears your history with the seed accounts — it never touches matches/swipes with real people. Combine it with `AUTO_LIKE_PHONE` in the same command to reset and re-like in one step.

## Stopping / resetting

```bash
docker compose stop        # stop, keep data
docker compose down -v     # stop and wipe the database
```

## Going further

- `DEPLOYMENT.md` — step-by-step guide to deploying the frontend on Vercel
  and the backend on Railway or Render (the two need separate hosts —
  see that file for why)
- `backend/README.md` — full endpoint list, environment variables, and the
  "what still needs real vendor credentials before launch" list
- `backend/COMPLIANCE_BRIEFING.md` — PECA 2016 / data residency questions to
  bring to actual Pakistani legal counsel (not a substitute for one)
- `frontend/README.md` — what's wired up on the frontend
