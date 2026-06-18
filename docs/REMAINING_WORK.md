# Jharanai CRM — Remaining Work (reconciled 2026-06-18)

This is the authoritative "what's left" list, produced by reconciling
`docs/AUDIT_REMEDIATION.md` (what was implemented across Batches 1–11) against the
full 139-finding `docs/AUDIT_FINDINGS.md`. Numbers: **139 confirmed findings · ~106
fixed · 4 false-positives (no fix) · ~29 still open or partial · final re-audit not
yet run.** All **18 criticals are fixed.** Verified green at time of writing:
backend `tsc` + **178 tests**, mobile `tsc` + **14 tests**, web-admin `tsc`.

> ⚠️ Every item below is point-in-time. **Re-verify against current code before acting.**
> Finding detail (WHAT/IMPACT/FIX/file:line) is in `docs/AUDIT_FINDINGS.md` by ID.

---

## A. Fixed but mislabelled in the tracker (verified done — do NOT redo)
The remediation tracker resolved these under a different ID; confirmed in code:
- **ADM-01** route↔exec reassignment history → done as Batch 11 §5.1.4 (`RouteAssignment` table + `assignmentHistory`).
- **ADM-12** holiday UI → done as **WEB-04**.
- **BAC-09** auto-resume FAILED-on-send → done as **ARC-06/EDG-12** (reminder is now best-effort, never reverts a committed resume).
- **BAC-11 / EDG-10** dup-reference mis-credit → closed by **DAT-10** (`Payment.reference` is now `@@unique`).
- **INT-02** worker liveness → covered by **PRO-07** (`/health` + heartbeat).

## B. Partially done — finish these
- [ ] **EDG-02** — onboarding can charge then fail to activate. Activation is now idempotent, but it still fires on the customer's *next inbound message*, not the payment webhook. Full fix needs webhook-driven activation (a Payment-intent/linkage column). Deferred-by-design today; revisit for true "pay → auto-activate".
- [ ] **EDG-03** — no "one ACTIVE subscription per customer" guard. Double-delivery/billing is prevented (unique delivery key + renew-extends), but admin-create + WhatsApp onboarding can still leave a customer with 2 ACTIVE subs, and cancel only cancels one. Add a partial-unique (customerId WHERE status=ACTIVE) or an app-level check across all create paths.

## C. Genuinely open — confirmed NOT addressed
**Backend / money / correctness**
- [ ] **INT-05** — Meta template variables mapped by `Object.values()` insertion order, not the template's declared slot array. *Can send wrong numbers in billing-facing WhatsApp messages.* **Highest priority of the remaining.** (`providers/messaging/meta.ts`)
- [ ] **ADM-11** — broadcast per-recipient `WhatsAppLog` not linked to `customerId` (audit/retry attribution lost).
- [ ] **CUS-10** — support flow parks in `await_close`, intercepting the customer's next message.
- [ ] **CUS-11** — no session/flow-timeout nudge; an abandoned onboarding resumed >24h later gets silence.
- [ ] **BAC-04 / CUS-09** — onboarding never asks a day-of-week pattern (always every-day); diverges from renew/admin. (Product decision: is every-day-only acceptable for onboarding?)
- [ ] **DAT-08** — reassigning a customer's route does NOT re-materialize today's already-created delivery (it stays on the old route until the next cron).
- [ ] **DAT-09** — `onDelete: Cascade` on Payment/Delivery means a future hard-delete would wipe financial history; no soft-delete/`deletedAt`. Latent (no hard-delete endpoint today). Recommend `onDelete: Restrict` on Payment/Delivery.
- [ ] **EDG-11** — delivery-confirm route-ownership guard read happens outside the atomic claim (cross-route race window).
- [ ] **EDG-13** — location-token consume (`POST /location/:token`) is not atomic (two concurrent saves both pass the used-check).
- [ ] **ARC-07** — bot-prompt cache is per-process; an admin prompt edit only refreshes the serving pod (multi-instance staleness).

**Mobile UX** (NOTE: exact finding text for several wasn't carried into the tracker — pull the WHAT/IMPACT from `docs/AUDIT_FINDINGS.md` by ID before fixing)
- [ ] **MIL-03** 0-L confirm sends "Delivered 0 L" *(NOTE: a 0-L guard was added in Batch 9 / MOB-06 — re-verify whether MIL-03 is already covered)*
- [ ] **MIL-06** re-scanning an already-done stop reopens the confirm sheet
- [ ] **MIL-07** door-pin GPS captured only on deliver, never on skip
- [ ] **MIL-08** Navigate with no pin hands maps a raw address string with no "approximate" warning
- [ ] **MIL-09** milkman with no assigned route sees a generic empty state, not "no route assigned — contact supervisor"
- [ ] **MOB-05** can't correct a wrong quantity / accidental skip after confirm (no edit path)
- [ ] **MOB-07** web build stores the JWT in plain `localStorage` (web is dev-preview only; hardening note)
- [ ] **MOB-09** offline bootstrap forces sign-out on server-down while the sync engine still drains under the cached token
- [ ] **MOB-11** off-route / transient-error scan shows "Unknown QR" — doesn't distinguish network/timeout from genuine not-found
- [ ] **MOB-12** first-delivery location capture is a direct (non-queued) best-effort call; lost when offline at the door

**Web-admin / integration / perf**
- [ ] **WEB-09** Add-Customer modal sends `litresPerDay` with no client validation (0/NaN possible)
- [ ] **ADM-07** customer "area" filter matches `addressLine1` client-side but `Customer.area` server-side (inconsistent results)
- [ ] **INT-07** mobile `EXPO_PUBLIC_API_BASE` defaults to the Android-emulator loopback; a release build without it baked in points at `10.0.2.2`; no https enforcement
- [ ] **INT-08** the public `/pin/<token>` page is served from `ADMIN_ORIGIN` — couples a customer flow to the internal admin origin (breaks if admin is locked down)
- [ ] **INT-09** `useApiWithFallback` shows mock fixtures on a live 5xx/network error — masks real outages; reserve for an explicit demo flag
- [ ] **INT-12** rename misleading `createRazorpayPaymentLink` (it's provider-agnostic) to avoid a future provider-lock regression
- [ ] **PER-09** today's-deliveries `ORDER BY customer.routeSeq` has no backing index (audit itself judged this near-unfixable due to the join — likely WONTFIX; confirm)

## D. Deferred / client-owned (⚪ — not code gaps)
- [ ] **PRO-09** PgBouncer `connection_limit=1` + interactive transactions guidance
- [ ] **PRO-10** Sentry traces sampling + per-job coverage (partly covered by PRO-06)
- [ ] **PRO-11** `prisma` CLI in devDeps risks migration skip on prod prune; make the release step hard-fail
- [ ] Real payment-gateway / Meta WhatsApp / SMS / email credentials
- [ ] **Applying** the committed migrations to prod (`prisma migrate deploy`) + provisioning **Redis** (REDIS_URL) for multi-instance
- [ ] Email-based admin forgot-password (authenticated change-password is done; needs an email provider)

## E. Not started
- [ ] **Batch 12 — final re-audit.** Independently re-audit the surfaces changed in Batches 1–11 (correctness/security/perf/UX) against the PRD, confirm no regressions, then finalize. **Run this fresh — verify, don't trust this record.**

---

## Completeness-critic coverage gaps (from the audit — worth a look during re-audit)
The audit's completeness critic flagged 12 areas it under-examined; see the
"COMPLETENESS CRITIC" section at the end of `docs/AUDIT_FINDINGS.md`. Highlights:
full-schema migration diff, the unauthenticated QR-PNG endpoint (DoS/enumeration),
dashboard revenue semantics, bulk-import atomicity, bot-prompt `${var}` interpolation
safety, the location-pin GET PII exposure, CORS-on-misconfig, inbound-media handling,
JWT revocation, seed-in-prod guards, settings type-coercion, and the confirm-path
cash-write idempotency.
