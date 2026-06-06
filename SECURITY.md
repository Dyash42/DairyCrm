# Security policy

Jharanai handles customer phone numbers, addresses, payment links, and
WhatsApp message logs. We treat security as a baseline, not a feature.

## What's safety-critical

These surfaces, if broken, cause real-world harm. They follow the SOP's
**100% test coverage target**:

| Surface | Failure mode if broken |
| --- | --- |
| `apps/backend/src/whatsapp/sender.ts` | Wrong / unwanted message → customer spam, cost |
| `apps/backend/src/whatsapp/webhook.ts` | Spoofed webhook → fake conversations, attacker control |
| Razorpay webhook handler (when added) | Forged "payment received" → free subscription |
| `apps/backend/src/whatsapp/flows/*` payment calc | Wrong amount → customer overcharged or undercharged |
| Prisma migrations | Schema drift → data loss |
| Admin login + JWT | Identity boundary |
| Executive OTP | Identity boundary |
| Delivery mutation endpoints | Logs determine billing |

## Reporting a vulnerability

Email the maintainer privately. **Do not open a public issue.**

If you find a serious issue (auth bypass, PII leak, payment forgery),
treat it like a P0 and ping the maintainer on WhatsApp.

## PII handling

| Field | Class | Rule |
| --- | --- | --- |
| Phone | PII | Stored. Never logged at INFO. Redact to `+91XXXXXXXX42` in DEBUG. |
| Name | PII | Stored. May be logged for support trails. |
| Address | PII | Stored. Never logged. |
| Email | PII | Stored. Never logged. |
| QR codes | Derivative | OK to log; they don't include payment data. |
| Razorpay payment IDs | Sensitive | Logged at INFO; never log full secret. |
| `META_ACCESS_TOKEN` | Secret | Never logged anywhere. |
| `JWT_SECRET` | Secret | Never logged anywhere. |

## Secrets

- **Never** commit `.env`. Only `.env.example` is in version control.
- Secrets live in:
  - Local dev: `apps/backend/.env`
  - Staging / production: Supabase / hosting provider env vars
- **Rotate** any secret that appears in chat, a PR, or a log dump.
  Rotation = generate new + update env + deploy + revoke old.

## Webhook signature verification

Every incoming webhook must verify a signature before any side effect:

- **Meta WhatsApp webhook**: `X-Hub-Signature-256` HMAC-SHA256 of the
  raw body with `META_APP_SECRET`. Implemented in
  `apps/backend/src/whatsapp/webhook.ts` (TODO: signature check in
  the framework wrapper — currently the wrapper is deferred).
- **Razorpay webhook**: `X-Razorpay-Signature` HMAC-SHA256 with the
  webhook secret. Verify before reading any payment claim.

**Reject mismatches with 401 — do not log the body.**

## Rate limiting

The webhook endpoint and all public endpoints must be rate-limited.
Token-bucket via Redis. Defaults:

- WhatsApp webhook: 50 req/sec per IP, burst 100
- Admin login: 5 req/min per IP

## Dependency hygiene

- Run `npm audit` weekly. Fix `high`/`critical` within 7 days.
- Pin dependency major versions; allow minor + patch via `^`.
- Subscribe to GitHub's Dependabot.

## Backups & disaster recovery

- Supabase keeps daily backups on Pro tier.
- Before any destructive migration, take a manual snapshot.
- Restore procedure: documented in `apps/backend/README.md`.

## What we don't do

- **No client-side trust** for payment. Razorpay webhook is the truth.
- **No third-party trackers** in the mobile app.
- **No analytics on admin web** beyond Sentry error tracking.
