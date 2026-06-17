# Deployment Runbook — Jharanai Backend

The backend is **two long-running processes** that share one codebase/image:

| Process | Command | What it does |
| --- | --- | --- |
| **API** | `npm --workspace @jharanai/backend run start:prod` | HTTP server (admin, mobile, WhatsApp + payment webhooks) |
| **Worker** | `npm --workspace @jharanai/backend run worker:prod` | All cron jobs: auto-resume, daily route gen, delivery-confirm WhatsApp, renewal reminders, end-of-day MISSED, subscription expiry, scheduled broadcasts |

> ⚠️ **Both must run.** If you deploy only the API, every scheduled job silently never fires (no auto-resume, no daily routes, no delivery confirmations). This was the single biggest production gap in the audit.

## Prerequisites

- **PostgreSQL** (Supabase or any Postgres 14+).
- **Redis** — required in production so the worker is a *single* scheduler (BullMQ) instead of per-pod `setInterval`. Without `REDIS_URL` the worker falls back to in-process intervals (fine for one instance / dev only).
- Node 20+ (only if not using Docker).

## 1. Configure environment

Copy `apps/backend/.env.example` → `.env` and fill it. Minimum for production (the boot guard refuses to start otherwise):

- `NODE_ENV=production`
- `DATABASE_URL` (+ `DIRECT_URL` for migrations)
- `JWT_SECRET` (non-default, ≥16 chars)
- `ADMIN_ORIGIN` (the real web-admin origin — CORS)
- `REDIS_URL`
- `TRUST_PROXY` = number of proxy hops in front (usually `1`)
- `PUBLIC_BASE_URL` = this backend's public URL (so the onboarding QR image is fetchable by Meta)

### The four "fill it in later" integrations

These run on **stubs** when their creds are absent — the app boots and the demo works, but the real-world behavior needs you to provision accounts:

1. **Payment gateway** — set `PAYMENT_PROVIDER` + `RAZORPAY_*` **or** `CASHFREE_*` (+ the webhook secret). Until then, payment links are stub URLs and no payment can be verified.
2. **WhatsApp (Meta Cloud API)** — set `MESSAGING_PROVIDER=meta` + `META_*` (incl. `META_APP_SECRET` for webhook signature verification). Until then, outbound messages go to the stub (visible in the admin bot-tester).
3. **SMS** — set `SMS_PROVIDER=msg91|twilio` + creds. **Until then, set `AUTH_STATIC_OTP` to a numeric pin** so the field team can log in without SMS. Unset it the moment real SMS is wired (a fixed pin is a shared credential; the app logs a warning while it's set).
4. **Database migrations** — you provision the DB and run the migrations (next section).

## 2. Run database migrations

```bash
cd apps/backend
npm run db:generate     # prisma generate
npm run db:migrate      # prisma migrate deploy   (uses DIRECT_URL)
npm run db:seed         # optional: seed products, settings, bot prompts, demo admin
```

Run `db:migrate` on every release (the `release:` line in the `Procfile` and the `api` container command do this automatically).

## 3a. Deploy with Docker Compose (single host)

```bash
# from the repo root; set JWT_SECRET, ADMIN_ORIGIN, PUBLIC_BASE_URL in .env
docker compose up --build -d
```

This brings up Postgres, Redis, the API (runs `prisma migrate deploy` on start), and the worker. Image is built from `apps/backend/Dockerfile` (build context = repo root).

## 3b. Deploy to a PaaS (Heroku / Railway / Render)

Use the `Procfile` (`release`, `web`, `worker`). Provision a Postgres add-on + Redis add-on and set the env vars. Ensure the Prisma CLI is available during the `release` phase (keep dev dependencies, e.g. `NPM_CONFIG_PRODUCTION=false`, or move `prisma` to dependencies).

## 4. Verify

- `GET /health` → `200` (liveness). `GET /health?strict=1` → `503` if the DB is unreachable.
- API logs `[jharanai/backend] listening`; worker logs `[worker] BullMQ workers up`.
- Trigger a WhatsApp "Hi" (or use the admin **Bot tester**) and confirm a reply.
- Set `SENTRY_DSN` to capture errors (the `@sentry/node` SDK is installed; `captureException` is wired at every job-failure site).

## Operational notes

- **Graceful shutdown**: both processes handle `SIGTERM`/`SIGINT` (drain HTTP, close Prisma/queues). Give the platform a grace period ≥ typical request time.
- **Logs**: production logs to **stdout only** (the platform aggregates). The local file log is dev-only.
- **Scaling**: the API is stateless EXCEPT the WhatsApp conversation session + idempotency cache, which are in-process today. Run a single API instance until those are moved to Redis (tracked follow-up), or pin WhatsApp webhook traffic to one instance.
