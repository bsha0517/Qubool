# Qubool

A culturally-aware matchmaking app for Pakistan: phone-verified profiles,
intention-based matching (marriage / serious relationship / friendship),
optional guardian mode, blur-until-match photos, CNIC/ID verification, and
moderated chat.

```
qubool/
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
accounts (Twilio, AWS, a KYC provider) are required to try the app locally:
- OTP codes are logged to the `qubool-api` container's logs instead of being texted
- CNIC/ID verification auto-passes
- Chat moderation runs on the local regex pre-filter only

To seed a few sample profiles once it's running:

```bash
docker compose exec api npm run seed
```

## Trying it out

1. Open http://localhost:5173
2. Enter a Pakistani-format number, e.g. `+923001234567`
3. Check the OTP in the logs: `docker compose logs api | grep OTP`
4. Enter the code, complete onboarding, and you'll land on the discover screen
5. Run the seed command above first if you want other profiles to browse

## Stopping / resetting

```bash
docker compose stop        # stop, keep data
docker compose down -v     # stop and wipe the database
```

## Going further

- `backend/README.md` — full endpoint list, environment variables, and the
  "what still needs real vendor credentials before launch" list
- `backend/COMPLIANCE_BRIEFING.md` — PECA 2016 / data residency questions to
  bring to actual Pakistani legal counsel (not a substitute for one)
- `frontend/README.md` — what's wired up vs. what UI still needs to be built
  (photo upload, ID verification screen, guardian invite screen)
