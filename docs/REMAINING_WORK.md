# Jharanai CRM — Remaining Work (updated 2026-06-18, after Batch 12)

This is the authoritative "what's left" list. **Batch 12 closed every remaining
code finding** across backend, mobile, and web-admin (waves A–D, all committed on
`audit-remediation`). What remains is **client-owned infrastructure/credentials**
and a small set of explicitly-deferred enhancements — not code defects.

**Verified green at time of writing:** backend `tsc` + **178 tests**, mobile
`tsc` + **14 tests**, web-admin `tsc`. See `docs/PRODUCTION_READINESS.md` for the
honest readiness assessment + the go-live checklist.

> Finding detail (WHAT/IMPACT/FIX) is in `docs/AUDIT_FINDINGS.md` by ID.
> Per-fix root-cause/solution is in `docs/AUDIT_REMEDIATION.md` (Batch 12 section).

---

## ✅ Closed in Batch 12 (code complete — verified)

**Backend (wave A + B)** — INT-05 (template slot mapping), ADM-11 (broadcast log
customerId), CUS-10 (support close), CUS-11 (session nudge + sliding TTL), EDG-13
(atomic location-token consume), ARC-07 (prompt-list merges defaults), EDG-11
(confirm + skip ownership folded into the atomic claim), DAT-08 (reassign
re-points today's deliveries), **EDG-02** (webhook-driven activation for
onboarding + renew, idempotent via a Payment-intent CAS), **BAC-04/CUS-09**
(onboarding honours a day-of-week pattern + bills delivery-days only), **EDG-03**
(one active subscription per customer), DAT-09 (Payment/Delivery `onDelete:
Restrict`), PER-09 (index-backed filter + JS sort), INT-08 (pin link from a
public origin env, not ADMIN_ORIGIN), INT-12 (provider-agnostic `createPaymentLink`).

**Mobile (wave C)** — MIL-06 (re-scan a done stop informs, no duplicate sheet),
MIL-07 (capture door pin on skip too), MIL-08 (approximate-nav warning + empty
destination guard), MIL-09 (explicit "no route assigned" state), **MOB-05**
(same-day correction of a confirmed/skipped stop — new backend
`POST /deliveries/:id/correct` reconciles door cash + audits), MOB-07 (web
JWT-in-localStorage preview-only warning), MOB-09 (degraded offline boot from
cached identity), MOB-11 (network/timeout vs unknown-QR), MOB-12 (location-capture
signal + retry-while-missing), INT-07 (release build fails loud without an https
API base). MIL-03 confirmed already covered by the 0-L guard (MOB-06).

**Web-admin (wave D)** — WEB-09 (litres validation), ADM-07 (area filter matches
the server field), INT-09 (mock fallback gated behind `NEXT_PUBLIC_DEMO=1`).

**Deploy** — PRO-11 (`prisma` CLI moved to `dependencies` so `migrate deploy`
survives a production prune).

---

## ⚪ Remaining — client-owned (NOT code gaps; need the client's accounts/infra)

These cannot be completed from the repo — they need real third-party credentials
or infrastructure the client provisions. See `docs/PRODUCTION_READINESS.md` for
the step-by-step go-live checklist.

- [ ] **Real payment-gateway credentials** (Razorpay or Cashfree) — set keys +
      webhook secret; without them the stub provider is used (no real links).
- [ ] **Meta WhatsApp Cloud API credentials** + template approval (the templates
      in `whatsapp/templates.ts` must be submitted/approved in WhatsApp Manager).
- [ ] **Real SMS provider** for executive OTP (currently `AUTH_STATIC_OTP` dev pin).
- [ ] **Provision Redis** (`REDIS_URL`) — required for multi-instance (sessions,
      OTP store, idempotency, rate-limit). Single-instance works without it.
- [ ] **Apply migrations to prod** — run `prisma migrate deploy` against the prod DB
      (all migrations through `20260618060000` are committed + drift-free).
- [ ] **Host the public `/pin/<token>` page** at `PUBLIC_PIN_BASE_URL` (the link is
      now built from that env; the page itself is the web-admin route — deploy it
      on a public origin, or front it, so admin can stay locked down — INT-08).
- [ ] **Email provider** for admin forgot-password (authenticated change-password
      is done; the email-reset flow needs an SMTP/email service).
- [ ] **PgBouncer** `connection_limit=1` guidance for the interactive-transaction
      paths (PRO-09 — deployment configuration note).

## 🟡 Deferred enhancements (working, but could go further — not launch blockers)

- [ ] **ARC-07 cross-instance cache invalidation** — the admin prompt list now
      merges defaults (the user-visible bug is fixed); a Redis pub/sub to push an
      edit to *all* pods instantly is a multi-instance nicety, not required for
      single-instance launch.
- [ ] **MOB-12 full offline queue for location capture** — capture is best-effort
      with retry-while-missing today; routing it through the durable scan queue
      would also survive an offline-at-the-door first delivery.
- [ ] **PRO-10 Sentry traces sampling** — configurable via
      `SENTRY_TRACES_SAMPLE_RATE` (default 0.1); tune per environment.

---

## Original audit reference

Full 139-finding record: `docs/AUDIT_FINDINGS.md`. Reconciliation history and the
per-batch remediation log: `docs/AUDIT_REMEDIATION.md`. All 18 criticals were
fixed in Batches 1–11; Batch 12 closed the remaining majors/minors above.
