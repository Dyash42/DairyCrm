# Jharanai CRM — Production Readiness (2026-06-18)

Honest assessment after the full audit + remediation (Batches 1–12). Written to
be the single page a reviewer or the client reads before go-live. No optimism
inflation — where something is the client's to do, it says so.

## Verdict: **~85% production-ready — code-complete; gated only on client infra/creds.**

Every defect the audit found in *our code* is fixed and verified. The remaining
15% is **not code** — it's third-party credentials, infrastructure provisioning,
and applying the (already-written, drift-free) migrations to the production
database. A competent ops pass through the checklist below gets to launch.

| Area | State | Notes |
|---|---|---|
| Backend correctness (money, scheduling, FSM) | ✅ Done | All 18 criticals + all backend majors/minors fixed; 178 tests green |
| WhatsApp bot (onboarding/renew/pause/resume/support) | ✅ Done | Webhook-driven activation; day-pattern billing; idempotent |
| Mobile delivery app (RN/Expo) | ✅ Done | Scan/confirm/skip/correct, offline queue, PIN auth, degraded offline boot |
| Web-admin | ✅ Done | Validation, filters, no outage-masking, dashboard analytics |
| Schema + migrations | ✅ Authored | Committed + drift-free; **must be applied to prod** (`migrate deploy`) |
| Payment gateway | ⚪ Client | Needs real Razorpay/Cashfree keys + webhook secret |
| WhatsApp (Meta) | ⚪ Client | Needs Cloud API creds + template approval |
| SMS OTP | ⚪ Client | Needs a real SMS provider (dev uses a static pin) |
| Redis (multi-instance) | ⚪ Client | Single-instance works without it; multi-instance needs `REDIS_URL` |

## What was fixed (high level)

- **Money path is sound.** Onboarding/renew bill exactly the deliveries the
  scheduler produces (day-of-week patterns honoured); the payment webhook now
  finalizes the subscription the moment it confirms (no "charged but not
  activated" gap), idempotently; one active subscription per customer; door-cash
  is idempotent and correctable; template variables are bound by declared slot,
  not insertion order, so billing numbers can't transpose.
- **Concurrency is safe.** Delivery confirm/skip ownership, location-token
  consume, and payment-intent activation are all single-statement
  compare-and-swaps — no check-then-write races.
- **Data integrity.** Financial/delivery history is protected from hard-delete
  (`onDelete: Restrict`); duplicate gateway references can't double-credit
  (`@@unique`).
- **Field UX.** Milkman gets clear states for no-route, already-delivered
  re-scans, approximate navigation, transient scan failures, and can correct a
  mistaken quantity/skip the same day without admin DB surgery; the app survives
  a server-down launch offline.

## Go-live checklist (client / ops)

1. **Database** — point `DATABASE_URL` + `DIRECT_URL` at the prod Postgres, then
   `cd apps/backend && npx prisma migrate deploy`. (`prisma` is now a runtime
   dependency, so this works even after `npm prune --production`.)
2. **Payments** — set `PAYMENT_PROVIDER` + the Razorpay **or** Cashfree keys and
   the webhook secret; register the webhook URL (`/payments/webhook`). The boot
   guard fails fast if prod resolves to the stub provider.
3. **WhatsApp** — set the `META_*` vars; submit the templates in
   `apps/backend/src/whatsapp/templates.ts` to WhatsApp Manager and wait for
   approval; set `META_APP_SECRET` (signature verification is mandatory in prod).
4. **SMS** — set `SMS_PROVIDER` (msg91/twilio) + its keys; unset `AUTH_STATIC_OTP`.
5. **Redis (if running >1 instance)** — set `REDIS_URL`. Sessions, OTP,
   idempotency, and rate-limit fall back to in-process memory without it (fine
   for a single instance only).
6. **Public URLs** — set `PUBLIC_BASE_URL` (backend; serves QR PNGs) and
   `PUBLIC_PIN_BASE_URL` (wherever the customer `/pin/<token>` page is hosted, so
   the admin app can be locked down). Set `ADMIN_ORIGIN` for CORS.
7. **Mobile build** — set `EXPO_PUBLIC_API_BASE=https://…` before building the
   release (the build throws if it's unset or non-https).
8. **Observability** — set `SENTRY_DSN`; tune `SENTRY_TRACES_SAMPLE_RATE`.
9. **PgBouncer** — if used, `connection_limit=1` for the pooled URL; keep
   `DIRECT_URL` un-pooled for migrations (PRO-09).

## Known limitations (non-blocking — see REMAINING_WORK.md)

- Cross-instance prompt-cache invalidation, full offline queue for door-pin
  capture, and email-based admin password reset are deferred enhancements.
- The mobile web build (`expo start --web`) stores the JWT in localStorage — it
  is a **preview only** and must not be shipped to executives against the real API.

## What cannot live in the repo (stated explicitly)

Real credentials and secrets (payment, Meta, SMS, Sentry DSN, DB passwords) and
customer PII (the source spreadsheet is git-ignored — import it via the bulk
flow, `docs/CSV_IMPORT.md`). These live in the client's secret manager / `.env`,
never in git.
