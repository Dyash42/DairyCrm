# Jharanai CRM — Audit Remediation Tracker

Tracks resolution of the 139 verified findings from the production-readiness audit.
Status legend: ✅ Fixed · 🔧 In progress · ⏭️ Pending · 🟡 Needs decision · ⚪ Deferred (config/infra owned by client)

> Verification policy: every batch runs `tsc --noEmit` + the full backend test suite
> (currently 174 tests) and/or mobile `tsc`. A fix is marked ✅ only after green.

---

## Batch 1 — P0 backend correctness + provider/webhook safety + security ✅ (tsc + 174/174 green)

### SEC-01 / EDG-07 — Stub messaging accepted unsigned webhooks ✅
- **Root cause:** `StubMessagingProvider.verifyWebhookSignature` returned `NODE_ENV !== 'production'`, accepting any unsigned body in dev/staging — a softer back door than the Meta provider.
- **Impact:** An internet-reachable non-prod box could have its conversation FSM driven by forged inbound messages (impersonate customers, create records, issue payment links).
- **Solution / impl:** Fail closed — now requires `NODE_ENV !== 'production' && ALLOW_UNSIGNED_WEBHOOK === '1'`, mirroring the Meta + payment stubs. `providers/messaging/stub.ts`.
- **Remaining risk:** None; dev must now set `ALLOW_UNSIGNED_WEBHOOK=1` to curl the webhook (intended).

### PRO-01 (+ INT-04/06/11 surfaced) — Prod silently ran on stub providers ✅
- **Root cause:** Boot guard only checked DB/JWT/ADMIN_ORIGIN; provider factories silently fall back to stubs when creds are absent.
- **Impact:** A prod deploy missing Meta/payment creds boots clean but sends no WhatsApp, rejects all payment webhooks, prints OTPs to stdout — no alert.
- **Solution / impl:** New `boot-guard.ts` (`assertBootProviders`) resolves the real providers at boot; **hard-fails in production** if messaging/payment resolve to `stub`, and **warns loudly** when `REDIS_URL` is unset or SMS resolves to console. Wired into `main.ts`.
- **Remaining risk:** Worker process not yet covered (PRO-06/07 batch).

### PRO-04 — SMS silently fell back to console ✅
- **Root cause:** `getSmsProvider()` fell through to console when an explicit `SMS_PROVIDER` was misconfigured.
- **Impact:** `SMS_PROVIDER=msg91` with a bad key → OTPs to stdout, field team locked out, no error.
- **Solution / impl:** Throws when an explicit provider is selected but not configured. `providers/sms/index.ts`.
- **Remaining risk:** None.

### PRO-05 — No global unhandledRejection/uncaughtException handlers ✅
- **Root cause:** Neither entrypoint registered process-level handlers; fire-and-forget paths exist.
- **Impact:** A stray rejection could crash the process invisibly (no Sentry).
- **Solution / impl:** Registered `unhandledRejection` (report) + `uncaughtException` (report + exit) in `main.ts`, both calling `captureException`.
- **Remaining risk:** `worker.ts` still needs the same (PRO-06 batch).

### SEC-02 — IDOR: any executive could overwrite any customer's GPS ✅
- **Root cause:** `POST /customers/:id/location` had no route-ownership check.
- **Impact:** A milkman could overwrite any customer's door pin across all routes (ids are returned in `/deliveries/today`), misrouting others.
- **Solution / impl:** Executives are now scoped to their own route (404 otherwise), matching `/confirm` + `/skip`. `modules/customers/index.ts`.
- **Remaining risk:** None.

### ADM-02 — Soft-cancel didn't stop deliveries ✅
- **Root cause:** `DELETE /customers/:id` only flipped `Customer.status`; the scheduler reads `subscription.status`.
- **Impact:** A "deleted" customer kept getting milk scheduled + billed forever.
- **Solution / impl:** DELETE now cancels active/paused subscriptions + voids pending renewal reminders in one transaction; **and** the scheduler excludes non-ACTIVE customers (`customer: { status: 'ACTIVE' }`) as a backstop. `modules/customers/index.ts`, `modules/deliveries/index.ts`.
- **Remaining risk:** Pending `AutoResumeJob`s for a cancelled customer aren't explicitly voided, but the scheduler backstop makes them inert.

### DAT-04 — Route delete swallowed FK error (false success) ✅
- **Root cause:** `prisma.route.delete().catch(() => null)` + only a customer-count guard.
- **Impact:** Admin saw "deleted" but the route (with historical deliveries) remained; cause hidden.
- **Solution / impl:** Counts deliveries → 409 `RouteHasDeliveries`; deletes inside try/catch mapping P2025→404 and propagating unexpected errors. `modules/routes/index.ts`.
- **Remaining risk:** None.

### ADM-10 / EDG-15 — Manual payment double-credit ✅
- **Root cause:** No idempotency on `POST /payments`; double-click/retry created two PAID rows.
- **Impact:** Customer balance over-credited; ledger drift.
- **Solution / impl:** Transaction now no-ops + returns the existing row when a same customer/amount/mode PAID payment was recorded in the last 60s. `modules/payments/index.ts`.
- **Remaining risk:** Not a true client idempotency key (a >60s deliberate re-record still credits). A dedicated `idempotencyKey` column is the durable fix (needs migration — deferred).

### PER-01 / PER-02 / ARC-02 — Materialization stampede + N+1 holiday ✅
- **Root cause:** `GET /deliveries/today` ran full materialization on every request; `isHoliday` issued one query per subscription.
- **Impact:** 500–1000 serial DB round-trips per app-open; morning login stampede saturates the pool.
- **Solution / impl:** Read path now materializes only when the day has zero rows (`materializeIfEmpty`); holiday lookup memoized per-date (one query/pass). `modules/deliveries/index.ts`.
- **Remaining risk:** Mid-day-added customers appear next cron cycle — mitigated for admin-created customers, which now insert today's delivery directly.

### BAC-01 / BAC-07 (mitigates BAC-05) — Renew created a duplicate subscription ✅
- **Root cause:** `activateSubscription` always `create`d a new ACTIVE sub.
- **Impact:** Renewing customers ended with two ACTIVE subs (inflated counts, discarded paid days, "cancel" only cancelled one); double-fired activation duplicated.
- **Solution / impl:** Now extends the existing ACTIVE sub (rolls `endDate` forward from the later of current end / today), resolves the prior reminder as `RENEWED` (advancing PRD-9.3 renewal metric), and schedules a fresh reminder. New subs only when none exists. `whatsapp/repos.ts`.
- **Remaining risk:** A genuine double-fire during *first* onboarding extends by one extra duration rather than duplicating (bounded; full idempotency needs payment↔subscription linkage — deferred). Add a renew-extend regression test (follow-up).

---

## Batch 2 — P0 mobile criticals ✅ (mobile tsc + 14/14 jest green)

### MIL-01 / MOB-02 — Offline queue poison-pill ✅
- **Root cause:** `drain()` stopped on the first failure and `bumpAttempt`-requeued it forever; `markFailed` was never called; no attempt cap.
- **Impact:** One permanent 4xx (404/403/422 on a reassigned/cancelled customer) on the oldest scan blocked the entire day's deliveries + cash from ever syncing — silently.
- **Solution / impl:** `drain()` now classifies errors: PERMANENT (`forbidden/notFound/conflict/validation`) or ≥`MAX_ATTEMPTS`(8) transient → `markFailed` + **continue** draining; transient-below-cap → bump + stop for the next online tick. Failed rows are surfaced via `failedDepth`. `state/syncStore.ts`.
- **Remaining risk:** Failed rows need a manual "retry/resolve" UI (follow-up); currently surfaced as a count + blocked EOD.

### MOB-03 — Queue drained under the wrong user ✅
- **Root cause:** Queue rows carried no owner; logout didn't scope them; drain used whatever token was current.
- **Impact:** On a shared device / re-login, user A's scans pushed under user B's token → cross-user cash misattribution.
- **Solution / impl:** Added `executive_id` column (+ idempotent migration); rows are tagged at enqueue and `takeNext`/`countPending`/`countFailed` are scoped to the current executive (legacy untagged rows still drain so nothing strands). `authStore` sets/clears the owner on login/logout. `storage/database.ts`, `state/syncStore.ts`, `state/authStore.ts`.
- **Remaining risk:** None material.

### MOB-01 / MIL-02 — EOD "cash variance" was meaningless ✅
- **Root cause:** EOD sent `litres × flat ₹64` estimate as `reportedCashTotal`; no field for actual cash.
- **Impact:** False shortfall every day for any UPI/partial/non-64-rate customer; anti-skimming control unusable.
- **Solution / impl:** Added a "Cash collected (₹)" input; the milkman's counted cash is sent as `reportedCashTotal`; the estimate is relabelled "Expected (system est.)". `app/(app)/end-of-day.tsx`.
- **Remaining risk:** Backend EOD query bounds/scope still need fixing (BAC-02/EDG-05/DAT-11 — pending).

### MOB-08 — EOD submitted on an unflushed queue ✅
- **Root cause:** `drainNow()` swallowed failures; submit proceeded regardless.
- **Impact:** Day report closed on partial data; backend under-counted deliveries/cash with no warning.
- **Solution / impl:** Submit now blocks when `queueDepth>0 || failedDepth>0` after drain, with a clear message; failed scans shown in a danger banner. `app/(app)/end-of-day.tsx`.

### MIL-05 — "Connected but no internet" treated as online ✅
- **Root cause:** `online` derived only from `isConnected`.
- **Impact:** Captive portal / rural cell → pushes time out instead of queuing; offline-first defeated.
- **Solution / impl:** `online = isConnected === true && isInternetReachable !== false`. `state/networkStore.ts`.

---

## 🟡 Needs decision before implementation (documented for approval)

- **DAT-03 / DAT-06 — Multi-product per customer.** `@@unique([customerId, scheduledFor])` collapses a 2nd product's delivery. **Decision:** does a customer ever get >1 product on the same day? If **no** → enforce one ACTIVE sub per customer (small). If **yes** → change the Delivery key to `(customerId, productId, scheduledFor)` + scheduler/billing changes (schema migration).
- **DAT-02 — `Customer.balance` semantics.** Only ever increments; "owes money" never fires. **Decision:** adopt "positive = owed" + decrement on payment, or **drop the column and derive outstanding from the ledger** (billing already does this). Recommend deriving.
- **Redis provisioning (Theme A).** I will implement Redis-backed session/idempotency/OTP/rate-limit stores with in-memory fallback. **Decision:** confirm a Redis instance will exist in production so multi-instance is actually enabled (else stays single-instance per boot warning).
- **Net-new PRD analytics** (PRD-7.4 By-Route exec performance, 7.5 By-Customer adherence, 9.1/9.3/9.5 metric instrumentation, 5.1.4 reassignment history). Larger features — confirm scope/priority vs. a scheduled follow-up.

---

## Pending backlog (by area) ⏭️

- **Mobile P0:** MIL-01/MOB-02 offline poison-pill, MOB-03 queue clear on logout, MOB-01/MIL-02 EOD cash input, MIL-05 captive-portal connectivity, MOB-06 cash validation, MOB-04 double-tap guard, MIL-04/MOB-10 route refresh.
- **Backend money/correctness:** BAC-02/EDG-05/DAT-11 EOD cash query bounds+scope, BAC-03 renew exact day count, BAC-04/CUS-09 onboarding day pattern, CUS-03 pause max-days, CUS-02 email validation, CUS-04 resume-no-pause, CUS-05 dup-phone onboarding, CUS-01/CUS-11 bot dead-ends, DAT-05 endDate vs daysOfWeek, DAT-10 payment reference unique, BAC-06/CUS-08 TZ, EDG-08 pause overlap, EDG-11/EDG-13 atomic guards, EDG-06/ARC-10 status callbacks.
- **Security:** SEC-03/ADM-04 bulk-commit re-validation, SEC-04 constant-time verify token.
- **Integration:** INT-05 template var mapping, INT-07 mobile API base, INT-09 mock fallback, INT-02 worker liveness, WEB-01 route name.
- **Prod-readiness:** PRO-02 worker SIGTERM, PRO-03 Redis (Theme A), PRO-06/07 worker error/health, PRO-09/10/11 deploy.
- **Performance:** PER-03/04 SQL aggregation, PER-06 FlatList, PER-07 session eviction, PER-08 reference index, PER-10 pagination.
- **Web-admin UX:** WEB-02/03/13 settings, WEB-04 holidays, WEB-05 broadcast errors, WEB-06 schedule, WEB-07 dashboard alert, WEB-08 docs 404, WEB-10 billing label, WEB-11 export, WEB-12 unassign, ADM-05/06/08/09.
- **DB hardening:** DAT-01 migration drift (⚪ client applies), DAT-08 reassignment re-materialize, DAT-09 cascade hardening.
- **Architecture:** ARC-03 per-phone locking, ARC-04 async broadcasts, ARC-06/EDG-12 auto-resume ordering, ARC-07 prompt cache, ARC-08 defer customer creation, ARC-09 idempotency GC.
