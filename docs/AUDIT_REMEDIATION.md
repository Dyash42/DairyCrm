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

## ✅ Decisions made (2026-06-17) — now in plan

- **INT-10 — auth bypass:** ✅ **Fixed + committed** (`fix(security)…`, branch `audit-remediation`). Real admin login restored; HEAD's pure-demo bypass is no longer the deployable state.
- **Commits:** Remediation committed in batches on branch `audit-remediation` (security first). Nothing pushed.
- **Multi-product (DAT-03/DAT-06):** **YES — customers may have multiple products/day.** Plan: change `Delivery` uniqueness to `(customerId, productId, scheduledFor)` + add `Delivery.subscriptionId`/`productId`; scheduler emits one delivery per (sub, day); billing aggregates by delivery. Requires a migration. → Batch 4.
- **Balance (DAT-02):** **Derive outstanding from the ledger.** Plan: stop writing `Customer.balance` as source of truth; compute owed = Σ(delivered litres × rate) − Σ(PAID payments) (billing already does this); fix the customer-list pill + CSV to use the derived value; keep/deprecate the column. → Batch 4.
- **Redis + Auth model:** **YES — implement Redis** for OTP/session/idempotency/rate-limit (graceful in-memory fallback when `REDIS_URL` unset). Adopt the **PIN-based mobile auth** model below as the going-forward standard. → Batch 3 (next).

---

## Batch 3 — Redis infrastructure ✅ (tsc + 174/174 green) · PIN auth 🔧 next

**Redis (Theme A — fixes ARC-01/PRO-03/INT-01/EDG-01/EDG-09/CUS-06/BAC-10/SEC-05/PER-07/ARC-09):** ✅ **DONE**
- New `redis.ts` — shared ioredis client, `getRedisOptional()` returns null (graceful fallback) when `REDIS_URL` unset; `getRedis()`/`closeRedis()`; `queue.ts` refactored to use it.
- `RedisSessionStore` (`wa:session:<phone>`, Redis-TTL) chosen when Redis is on; `InMemorySessionStore` fallback. `session-store.ts`.
- Redis idempotency: atomic `SET NX EX` on `wa:dedupe:<msgId>` (cross-instance), Map fallback. `engine.ts`.
- Redis OTP store (`otp:<phone>`, TTL + attempts) — OTP requested on pod A verifies on pod B, attempts aggregate, restart-safe. `auth/index.ts`.
- `@fastify/rate-limit` Redis store when available. `server.ts`.
- Redis closed on graceful shutdown. `main.ts`.
- **Remaining:** per-phone processing lock (`wa:lock:<phone>`) for ARC-03 — pending (now feasible since Redis is wired).

**PIN-based mobile auth:** ✅ **DONE** (backend tsc + 174/174 · mobile tsc + 14/14)
- Schema: `User.pinHash/pinSetAt/pinFailedAttempts/pinLockedUntil` (dev DB synced via `db push`; **prod migration still to author — see Batch 4**).
- `POST /auth/executive/pin/set` (authed, post-OTP) + `POST /auth/executive/pin/verify` (phone+PIN→JWT, bcrypt, lockout after 5 → re-OTP); `pinSet` flag added to OTP-verify response.
- Mobile: secure PIN-phone store, `authApi.setPin/verifyPin`, `authStore` `needsPin`/`needsPinSetup` states + flows, Create-PIN / Enter-PIN screens, root-layout routing. OTP only for first-time / new-device / logout / forgot-PIN / lockout.
- **Remaining:** admin/web **password-reset** flow (RBAC already enforced via `requireRole`) — pending. ARC-03 per-phone Redis lock — pending.

⚠️ **Migration debt:** `User.pin*`, `LocationToken`, `Customer.lat/lng/geoUpdatedAt` are synced to the **dev DB via `db push`** but have **no committed migration** (DAT-01). Batch 4 must author the consolidated migration(s) so `prisma migrate deploy` provisions prod correctly.

---

## Batch 4 — migrations + data model ✅ (backend tsc + 174/174 · web-admin tsc · migrations verified drift-free)

### DAT-01 — migration drift ✅
- **Root cause:** `LocationToken`, `Customer.geo`, `User.pin*` only ever applied to dev via `db push`; no migration files → `migrate deploy` prod DB lacked them and every location/PIN feature crashed.
- **Solution / impl:** Authored `20260618000000_location_geo_and_executive_pin` via `prisma migrate diff` (shadow DB). Verified: replaying all migrations now matches the schema with **zero drift**.

### DAT-03 / DAT-06 — multi-product deliveries ✅ (decision: customers may have multiple products/day)
- **Root cause:** `@@unique([customerId, scheduledFor])` + `createMany skipDuplicates` silently dropped a 2nd product's delivery; no `one active sub` guard.
- **Solution / impl:** `Delivery` gained `subscriptionId` + `productId` (FKs); uniqueness is now `@@unique([customerId, productId, scheduledFor])`. The scheduling engine carries `subscriptionId`/`productId` and emits one delivery per active sub/day; both materializers + the seed + admin-create set them. `buildScheduleRepo` was **de-duplicated into `services/schedule-repo.ts`** (was copy-pasted across deliveries + daily-route-gen, and the copies had drifted). Route endpoints now include `product.name`. Migration `20260618010000_multi_product_deliveries` authored + verified drift-free. Billing already aggregates per-delivery so multi-product totals are correct. Single-product (the norm) behaviour unchanged — verified by re-seed (9 deliveries) + 174 tests.
- **Remaining:** mobile route should show product name per stop (cosmetic; only visible once a customer actually has 2 products) — deferred to majors batch.

### DAT-02 — balance derived from ledger ✅ (decision: derive from ledger)
- **Root cause:** `Customer.balance` only ever incremented; the "owes money" pill could never fire.
- **Solution / impl:** Customer-list endpoint now returns `outstanding` = Σ(delivered litres × rate) − Σ(PAID payments), via two scoped aggregate queries (no N+1). Admin list uses `outstanding` for the owes/credit pill (negated into the existing convention). `Customer.balance` retained but no longer the source of truth.
- **Remaining:** CSV export still dumps `balance` (cosmetic) — switch to `outstanding` later.

**Migration debt CLEARED** for everything built so far: `prisma migrate deploy` against a fresh DB now provisions the full schema (verified empty diff). The dev DB is in sync via `db push`.

**PIN-based mobile auth (new preferred model):**
- **Backend:** `POST /auth/executive/pin/set` (authed, after OTP — stores bcrypt(pin) on a new `Executive.pinHash` + `pinSetAt`); `POST /auth/executive/pin/verify` (phone + pin → JWT, rate-limited, lockout after N fails); OTP still required for first-time setup, logout, PIN reset, new device, session expiry. Device binding via a `deviceId` claim. Migration: add `pinHash`, `pinSetAt`, `pinFailedAttempts`, `pinLockedUntil` to Executive (or a `DeviceSession` table for multi-device).
- **Mobile:** after OTP verify → "Create PIN" screen (4/6 digit) → store securely (expo-secure-store, native) + a session marker; subsequent launches → "Enter PIN" unlock screen calling `/pin/verify`; "Forgot PIN"/logout → OTP path. Replaces OTP-every-launch.
- **Admin/Web:** already email+password; add **password reset** flow + verify **RBAC** coverage. No per-session OTP.
- Updates audit items: PRD-6.1 (login), INT-01/EDG-09/SEC-05 (OTP store), and reduces SMS cost (PRD-8).

---

## Batch 5 — majors/minors 🔧 (in progress)

### 5a — WhatsApp bot + EOD cash ✅ (backend tsc + 174/174)
- **CUS-01** menu re-renders on an unmatched reply instead of going silent (`flows/menu.ts`).
- **CUS-02** onboarding email validated + "skip" honored (`flows/onboarding.ts`).
- **CUS-03** WhatsApp pause enforces `pause.max_days` like the admin path (`flows/pause.ts`).
- **CUS-04** resume checks for an active pause before confirming (`flows/resume.ts`).
- **CUS-05** onboarding catches duplicate-phone P2002 and guides the user (`flows/onboarding.ts`).
- **BAC-02 / EDG-05 / DAT-11** EOD cash scoped to the executive's own deliveries via the `delivery:<id>` reference + bounded to today's window (`modules/deliveries/index.ts`).

### 5b — backend safety + web-admin visible bugs ✅ (backend tsc + 174/174 · web-admin tsc)
- **ARC-06 / EDG-12** auto-resume now claims + activates in ONE transaction (crash-safe; no more "RESUMED but still PAUSED forever"); reminder is best-effort and never reverts a committed resume (`jobs/auto-resume.ts`).
- **SEC-04** constant-time `META_VERIFY_TOKEN` comparison (`whatsapp/webhook.ts`).
- **EDG-08** overlapping-pause guard in `pauseSubscription` (`whatsapp/repos.ts`).
- **WEB-01** customer list now returns + renders the real `routeName` (was looking up live cuids in the mock array → always "—").
- **WEB-10** billing labels use the actual period, not hardcoded "May 2026".
- **WEB-11** billing "Export CSV" wired (client-side from loaded invoices).
- **WEB-12** ExecutiveSelect always offers "Unassigned" so an assignment can be cleared.
- **ADM-05** route-assign surfaces the 409 conflict instead of swallowing it.

### 5c — worker production-readiness + perf ✅ (backend tsc + 174/174 · migrations drift-free)
- **PRO-02** workers tracked + drained/closed on SIGTERM before Redis quit (`jobs/queue.ts` `closeWorkers`, `jobs/worker.ts`).
- **PRO-06** every BullMQ worker has `error`/`failed` listeners → `captureException` (`jobs/queue.ts`).
- **PRO-07** worker `/health` HTTP endpoint + per-tick `lastTickAt` heartbeat (`jobs/worker.ts`).
- **PRO-05 / ARC-05** interval mode runs each job once at boot + `.catch` on every tick (`jobs/worker.ts`).
- **PER-08** `Payment.reference` index + migration `20260618020000_payment_reference_index`.

### 5d — web-admin visible bugs ✅ (web-admin tsc)
- **WEB-07** dashboard "no executive" alert driven by real route-exec data (not 0% completion) + CTA navigates to /routes (`app/page.tsx`).
- **WEB-04** holiday Add/Remove wired to the API (`app/settings/page.tsx`, `lib/api.ts createHoliday/deleteHoliday`).
- **WEB-05** broadcast send surfaces failures (no more silent swallow on a paid action).
- **WEB-06** dead "Schedule" broadcast button disabled with an honest label (full scheduling UI = later feature).
- Already fixed in working tree (verified): **WEB-01** (route name), **WEB-10** (billing period label), **WEB-11** (export wired), **WEB-12** (unassign option), **ADM-05** (409 surfaced).

### 5e — backend (parallel workflow, centrally verified) ✅ (backend tsc + 174/174)
Implemented by 5 agents on disjoint files, then verified centrally + diffs reviewed:
- **ARC-03** per-phone Redis lock around `engine.process()` (serializes same-phone messages; no-op without Redis) — `whatsapp/engine.ts`.
- **BAC-03 + CUS-07** renew charges the EXACT `countDeliveriesInRange` over the real window (not the weekRatio approximation) + renders a normalized day-pattern label and re-prompts on unparseable input — `whatsapp/flows/renew.ts`.
- **EDG-06 / ARC-10** Meta `statuses[]` (sent/delivered/read/failed) update `WhatsAppLog` by `metaMsgId` — `whatsapp/webhook.ts`. (Cost not derivable from the status payload; left untouched.)
- **DAT-05** `POST /subscriptions` quote counts the INCLUSIVE `[startDate, endDate]` window the scheduler actually delivers (endDate-inclusive is test-locked) — billed == delivered — `modules/subscriptions/index.ts`.
- **ARC-04 / INT-03 / PER-05** `POST /broadcasts/:id/send` enqueues to the `broadcast-send` worker (atomic claim → per-recipient resilient send → batched `createMany` logs → terminal status); inline fallback when Redis is off — `modules/broadcasts/index.ts`, `jobs/scheduled-broadcasts.ts`, `jobs/worker.ts`.

> ⚠️ **Residual (needs a product/money decision):** the scheduler is endDate-INCLUSIVE, so a "30-day" every-day sub delivers 31 times. DAT-05 made the **admin** path bill that inclusive count; **onboarding** (PRD "X×rate×days") and **renew** still bill the base `durationDays` → they under-bill by ≤1 delivery vs. what's delivered. Resolve by either (a) aligning onboarding/renew to the inclusive count, or (b) making the scheduler endDate-exclusive (charge exactly `days`, update the test). Bounded ≤₹64×litres edge.
>
> ✅ **RESOLVED in Batch 6 (2026-06-18):** user chose **(b) — "N days = N deliveries"**. See Batch 6 / DAT-05.

---

## Batch 6 — money & correctness ✅ (backend tsc + 175/175 · web-admin tsc)

### DAT-05 — endDate inclusivity (billed == delivered) ✅ — decision: endDate-EXCLUSIVE
- **Root cause:** `endDate` is stored as `startDate + durationDays` (the renewal boundary) everywhere, but the scheduler delivered on the INCLUSIVE window `[startDate, endDate]` (`day > endDate` skip). A 30-day sub thus delivered 31×, while onboarding/renew billed the literal 30 — and the admin path had been "fixed" by billing the inflated 31 (DAT-05 residual).
- **Solution / impl:** Scheduler now treats `endDate` as the EXCLUSIVE renewal boundary — delivers the half-open window `[startDate, endDate)` (`day >= endDate` skip) — so a 30-day every-day sub delivers exactly 30× (`services/scheduling.ts`). Removed the `+1` "billedWindowDays" inflation from admin `POST /subscriptions` and `POST /subscriptions/quote`; both now bill plain `durationDays` via `calculateQuote` (`modules/subscriptions/index.ts`). Onboarding (`litres×days×rate`) and renew (`countDeliveriesInRange`) already billed `durationDays`, so all three paths + the materializers (which funnel through `getDeliveriesForDate`) are now consistent: **billed == delivered**. Updated the scheduler window test for exclusive semantics and added a regression test asserting `delivered === calculateQuote(...).deliveryCount` for EVERY_DAY (30) and MON_TO_SAT (26). `expire-subscriptions` (`endDate < today`) and `nextRenewalDate` (`start + durationDays`) already match the exclusive convention — unchanged.
- **Remaining risk:** None for the common case. A non-EVERY_DAY customer who renews *early* still has a small window-alignment edge (renew bills `[today, today+duration)` while delivery resumes from the prior `endDate`) — pre-existing, separate from DAT-05, ≤1–2 deliveries; noted for a later renew-window pass.

### CUS-08 — pause-flow dates computed in server-local time, not IST ✅
- **Root cause:** `flows/pause.ts` had local `isoDate`/`parseLooseDate`/`addOneDay` helpers using `getFullYear`/`getMonth`/`getDate`/`setDate` (server-local). On a UTC-clock prod box a customer messaging at 00:00–05:29 IST resolved "today"/"tomorrow"/default-year to the previous calendar day.
- **Solution / impl:** Replaced the local helpers with the business-TZ helpers from `utils/dates` (`startOfBusinessDayUTC`, `addDays`, `isoDate`); "today"/"tomorrow"/default-year and the past-date guard are now anchored to the IST business day; `daysBetween`/`addOneDay` parse explicit UTC midnight. `flows/pause.ts`.

### BAC-06 — date-only columns compared against raw `new Date()` ✅
- **Root cause:** `getActivePause` (`whatsapp/repos.ts`) compared the date-only `endDate`/`startDate` columns against the raw UTC instant `new Date()`, so a pause ending *today* read as already-over for the entire final IST day → the resume flow reported "no active pause". The two resume paths computed "today" from `getUTCFullYear()` of now (UTC date, not IST date).
- **Solution / impl:** `getActivePause` and both resume `todayUtc` computations (`whatsapp/repos.ts` `resumeSubscription`, `modules/subscriptions/index.ts` resume endpoint) now use `startOfBusinessDayUTC()` (IST midnight).

### EDG-04 / BAC-08 — active customers with no route silently undelivered + unbilled ✅
- **Root cause:** Both materializers (`daily-route-gen`, deliveries `materializeTodaysDeliveries`) `.filter(p => p.routeId !== null)` — correct (a delivery needs a route) but it means an ACTIVE customer with an ACTIVE subscription and no route gets NO Delivery row → never delivered, and billing (which reads deliveries) never bills them. Silent revenue leak, invisible to ops.
- **Solution / impl:** Surfaced the at-risk set. Dashboard `GET /metrics` now returns `breakdown.unroutedActive` (count of `status=ACTIVE AND routeId=null AND has ACTIVE sub`); `GET /customers?unrouted=true` returns exactly that list (`modules/dashboard/index.ts`, `modules/customers/index.ts`). Web-admin: dashboard shows a danger alert + breakdown line with a CTA deep-linking to the filtered customers list, which honors `?unrouted=true` (SSR-safe param read + clearable chip + server/mock filter). `app/page.tsx`, `app/customers/page.tsx`, `lib/api.ts`, `lib/mock-data.ts`, `packages/shared/src/types.ts`.
- **Remaining risk:** Surfacing is covered by `tsc` + the green suite; the count/filter Prisma queries are thin and not behaviorally unit-tested (live-DB territory — the suite mocks Prisma).

---

## Batch 7 — security & data integrity ✅ (backend tsc + 178/178 · web-admin tsc · migrations drift-free)

### SEC-03 / ADM-04 — bulk `/commit` trusted client-submitted rows ✅
- **Root cause:** `POST /customers/bulk/commit` took `rows: ValidatedRow[]` straight from the client and only re-fetched route/product maps — it never re-ran field validation. The `/validate` preview runs in the browser, so a crafted POST could smuggle out-of-range litres, negative/huge durations, malformed phones/codes, or unbounded strings directly into the DB.
- **Solution / impl:** `/commit` now re-validates EVERY row server-side against a strict `CommitRow` Zod schema (mirrors `validateCsv`'s field rules); invalid rows go to `failures` and are never written. Also re-checks phone + customer_code uniqueness against the DB and within the batch (matching `/validate`), with the DB unique constraint as the final backstop. Added 3 endpoint tests (reject malformed rows · import a valid row so the schema isn't over-strict · reject a DB-duplicate phone). `modules/customers/bulk.ts`, `modules/customers/bulk-flow.test.ts` (+3 → 178 total).

### DAT-10 — payment reference not unique (durable double-credit backstop) ✅
- **Root cause:** `Payment.reference` had only a non-unique index. Double-credit protection was code-only (the ADM-10 60s heuristic for manual payments + the idempotent confirm claim) — no DB-level guarantee.
- **Solution / impl:** `Payment.reference` is now `@@unique` (replaces the PER-08 `@@index` — a unique index serves the lookup too). Nullable, so multiple manual payments without a reference are still allowed (Postgres NULLs are distinct); gateway link ids and `delivery:<id>` cash tags are forced unique, so the webhook can never reconcile/create two PAID rows for one ref and the door-cash payment can't be inserted twice. `POST /payments` now maps the resulting P2002 to a clean 409. Migration `20260618030000_payment_reference_unique` authored via shadow-DB diff + verified drift-free. `prisma/schema.prisma`, `modules/payments/index.ts`. (Prisma client regen + dev `db push` owned by the client.)

### ARC-08 — customer-creation timing ✅ — decision: add a PENDING lead state
- **Root cause:** WhatsApp onboarding creates the Customer (status ACTIVE) at the litres step, before payment; abandoners left ACTIVE records with no subscription — roster/count clutter (does NOT corrupt delivery/revenue metrics, and is not the EDG-04 set). Deferring creation until paid was evaluated and **rejected** (the payment-verification model needs a Customer + PENDING Payment at link-creation time; deferring breaks webhook reconciliation and risks paid-but-no-account).
- **Solution / impl:** Added `PENDING` to the `CustomerStatus` enum (migration `20260618040000_customer_pending_status`, drift-free). WhatsApp `createCustomer` now sets `PENDING`; `activateSubscription` already flips to `ACTIVE` on payment, so an abandoned onboarding stays `PENDING` — a distinct lead the scheduler / active-customer counts / EDG-04 surfacing all ignore (they key on `ACTIVE`). Admin single-create + bulk import stay `ACTIVE` (real customers). Web-admin: `CustomerStatus` type + pill TONE/LABEL maps gained `PENDING` ("Pending", muted tone) and the customers list gained a **"Leads"** filter tab. `prisma/schema.prisma`, `whatsapp/repos.ts`, `packages/shared/src/types.ts`, `lib/api.ts`, `app/customers/page.tsx`, `app/customers/[id]/page.tsx`.
- **Remaining risk:** A PENDING abandoner who messages "Hi" again is treated as an existing customer (gets the menu) rather than resuming onboarding — pre-existing behavior (any created record short-circuits onboarding), not a regression; a "resume onboarding when sub-less" enhancement is noted for later. Default customer roster still lists PENDING (distinguished by pill + Leads tab); not suppressed by default to avoid hiding data.

---

## Batch 8 — performance ✅ (backend tsc + 178/178 · raw SQL validated against dev DB)

### PER-03 — dashboard aggregated all rows in memory ✅
- **Root cause:** `GET /dashboard/metrics` `findMany`-ed the whole window into memory and reduced in JS — `aggregates()` ran twice (current + prior) and a full breakdown fetch (with route include) ran once. At 1k subscribers a MONTH view loaded ~75k Delivery rows per request.
- **Solution / impl:** Every aggregate is now SQL. `aggregates()` is a single `$queryRaw` (`COUNT(*)` + `COUNT FILTER` + `SUM(COALESCE(delivered,scheduled)) FILTER` for delivered litres) + the existing payment `aggregate`. pending/missed via `groupBy(status)`; by-route via a grouped `$queryRaw` joined to route names; the hourly (TODAY, TZ-bucketed via `scannedAt AT TIME ZONE 'UTC' AT TIME ZONE <BUSINESS_TZ>`) / daily (WEEK·MONTH) series via grouped `$queryRaw` with JS zero-fill. Response shape byte-identical. All four query forms validated against the seeded dev DB. `modules/dashboard/index.ts`.

### PER-04 — billing loaded all delivered rows + includes ✅
- **Root cause:** `GET /billing/invoices` `findMany`-ed every delivered row for the month with customer/subscription/route includes (~25k rows + joins), grouped per customer in JS.
- **Solution / impl:** Per-customer billed litres + amount aggregated in one `$queryRaw` — `SUM(COALESCE(deliveredLitres,scheduledLitres) * COALESCE(delivery.rate, latest-ACTIVE-sub.rate, settings default))` via a LATERAL join. Postgres `numeric` SUM is exact (≥ the old Prisma.Decimal precision); cast to float8 once for transport. Payments aggregated per customer in SQL (cumulative total + most-recent mode). Response shape preserved. SQL validated against dev DB. `modules/billing/index.ts`.

### PER-10 — unbounded subscription list ✅
- `GET /subscriptions` (admin, no `customerId`) fetched every subscription row unbounded. Now capped + cursor-paginated (`limit` default 100, max 500, `nextCursor`). `modules/subscriptions/index.ts`.

---

## Batch 9 — mobile UX ✅ (mobile tsc + 14/14 jest)

### PER-06 — route list not virtualized ✅
- `route.tsx` rendered every `StopCard` at once inside a `ScrollView` + `.map()`. Now a `FlatList` (virtualized); the search bar stays OUTSIDE the list (avoids the RN ListHeader TextInput-focus-loss pitfall), the route-complete card is the `ListHeaderComponent`, and the empty state is `ListEmptyComponent`.

### MIL-04 / MOB-10 — route never auto-loaded / went stale ✅
- The route only loaded via manual pull-to-refresh (no mount/focus load). Added a `useFocusEffect` that refreshes on focus (mount, app resume, return from scan/EOD), **guarded** to never clobber optimistic offline marks: refresh only when `online && (queueDepth === 0 || stops.length === 0)`. `app/(app)/route.tsx`.

### MOB-04 — double-tap on "Mark delivered" ✅
- `ConfirmDeliverySheet` had no submit guard — a double-tap could fire two `/confirm` scans. Added a `submitting` flag (reset whenever the sheet re-opens, even for the same stop) gating both deliver + skip. (EOD already had its own `submitting` guard from Batch 2.) `components/ConfirmDeliverySheet.tsx`.

### MOB-06 — 0-L confirm + cash validation ✅
- A 0 L "delivery" is a skip, not a delivery: the "Mark delivered" button is now disabled at qty ≤ 0 (with a nudge to Skip) and `handleDeliver` blocks it. Cash input now ignores negatives/NaN (`>= 0` clamp; backend also caps at 100000). EOD cash validation was already present (Batch 2). `components/ConfirmDeliverySheet.tsx`.

### Product name per stop ✅ (DAT-03 follow-up)
- The backend `/deliveries/today` already returned `product.name`, but the mobile model/API dropped it. Added `productName` to `DeliveryStop` (+ `copyWith`), mapped it in `deliveryApi.todaysRoute`, and the confirm sheet now shows which product to hand over (only visible once a customer has a product set). `models/delivery.ts`, `api/deliveryApi.ts`, `components/ConfirmDeliverySheet.tsx`.

> **Not done (need finding text):** MIL-03/06/07/09 + MOB-05/07 — exact finding details aren't in the tracker; the clearly-described mobile items above are complete. Will address these once their evidence is provided.

---

## Batch 10 — web-admin UX ✅ (backend tsc + 178/178 · web-admin tsc)

- **WEB-02/03/13 — settings validation ✅** Save was wired (per-key dirty tracking + reload), but neither side validated input — a blank/garbage NUMBER field stored `NaN`, a negative pause cap/duration was accepted. Added validation on BOTH ends: client rejects non-finite/negative NUMBER settings before POST; `PUT /settings/:key` validates by `def.type` (NUMBER ≥ 0 finite, coerces BOOLEAN/STRING) and persists the coerced value. `modules/settings/index.ts`, `app/settings/page.tsx`.
- **ADM-06 — search debounce ✅** The customer list refetched on every keystroke (`[query]` dep). Added a 300ms debounce for the search + area inputs (input stays responsive; the live fetch + client re-filter use the debounced values). `app/customers/page.tsx`.
- **ADM-03 — route-reassign UI ✅** `PATCH /customers/:id` already accepted `routeId`; the UI was missing. Added a route picker + "Reassign route" control on the customer detail header (`fetchRoutes` + `updateCustomer`). (Today's already-materialized delivery keeps its old route until the next cron — DAT-08 re-materialize is separate/tracked.) `app/customers/[id]/page.tsx`, `lib/api.ts updateCustomer`.
- **ADM-08 — litres→sub sync ✅** Editing a customer's `litresPerDay` changed only the customer row; the scheduler/materializer read the SUBSCRIPTION's litres, so the edit didn't change what was delivered/billed. `PATCH /customers/:id` now updates the ACTIVE subscription's `litresPerDay` in the same transaction. `modules/customers/index.ts`.
- **Admin password-reset ✅** Added `POST /auth/admin/password` (authenticated; requires the current password, bcrypt-verified; new ≥ 8 chars, must differ) + a "Change password" card on Settings. No email-based forgot-password flow yet (needs an email provider — tracked). `modules/auth/index.ts`, `app/settings/page.tsx`, `lib/api.ts changeAdminPassword`.
- **WEB-08 — dead docs link ✅** The CSV-import page linked to `/docs/csv-import` (404). Replaced with on-page guidance (the column reference + template are right there). `app/customers/import/page.tsx`.

---

## Batch 11 — net-new PRD analytics ✅ (backend tsc + 178/178 · web-admin tsc · migration drift-free)

### PRD §5.1.4 — route↔executive reassignment history ✅
- New append-only `RouteAssignment` audit table (migration `20260618050000_route_assignment_history`, drift-free; ids stored as plain strings so history survives entity deletion). `POST /routes/:id/executive` writes one row per actual change, atomically inside the existing reassignment transaction (prev → new exec + `changedBy`). `GET /routes/:id` returns the recent `assignmentHistory` (exec ids resolved to names); the route detail page renders a "Reassignment history" card. `prisma/schema.prisma`, `modules/routes/index.ts`, `lib/api.ts`, `app/routes/[id]/page.tsx`.

### PRD §7.4 — By Route: executive performance ✅ (ADM-09)
- `GET /dashboard/by-route?range=` → per route: assigned executive, customer count, scheduled/delivered, completion %, litres (delivery aggregation in SQL). Rendered as a "By route — executive performance" table on the dashboard. `modules/dashboard/index.ts`, `app/page.tsx`, `lib/api.ts`.

### PRD §7.5 — By Customer: value, adherence, payment ✅
- `GET /dashboard/by-customer?range=&cursor=` (cursor-paginated) → per customer: monthly subscription value (litres × rate × days/wk × 4.33), delivery adherence % (delivered/scheduled over range, SQL), and outstanding (billed − paid). Rendered as a "By customer — value & adherence" table. `modules/dashboard/index.ts`, `app/page.tsx`, `lib/api.ts`.

### PRD §9 — success-metric instrumentation ✅
- `GET /dashboard/success-metrics` → onboarding completion (proxy via the new PENDING lead state — activated vs activated+leads; target 85%), delivery confirmation rate (delivered/scheduled, last 30d; target 98%), renewal rate (RENEWED vs lapsed reminders; target 80%), each with the raw counts. Rendered as a "Success metrics" card (rate vs target tiles). Honest labels — onboarding completion is approximate (admin/bulk-created customers count as completed; no creation-source tag). `modules/dashboard/index.ts`, `app/page.tsx`, `lib/api.ts`.

---

## Batch 12 — close every remaining code finding ✅ (backend tsc + 178/178 · mobile tsc + 14/14 · web-admin tsc · migration drift-free)

Closed all open majors/minors across the three apps in four disjoint waves. See
`docs/PRODUCTION_READINESS.md` for the readiness verdict and `docs/REMAINING_WORK.md`
for the (client-owned) remainder.

### Wave A — backend (disjoint files, parallel)
- **INT-05** — Meta template params mapped by the template's declared slot array (`templates.ts` `variables[]`), throwing on a missing slot, instead of `Object.values()` insertion order → billing numbers can't silently transpose.
- **ADM-11** — broadcast per-recipient `WhatsAppLog` rows now carry `customerId` (per-customer audit + targeted retry).
- **CUS-10** — support flow sends the close + resets immediately; no longer parks in `await_close` intercepting the next message.
- **CUS-11** — sessions slide their 24h TTL on each inbound; a fall-through (fresh/expired, non-greeting) now nudges instead of going silent.
- **EDG-13** — single-use location-token consume is an atomic `updateMany … where usedAt IS NULL` compare-and-swap.
- **ARC-07** — admin bot-prompt list merges `DEFAULT_PROMPTS` with DB overrides (no empty editor on an unseeded DB). Cross-instance invalidation deferred.
- **EDG-11** — delivery confirm **and** skip fold route-ownership into the atomic claim (race-free authz).
- **DAT-08** — a route reassignment re-points today's still-PENDING deliveries to the new route.

### Wave B — backend money/schema (sequential)
- **EDG-02** — the signature-verified payment webhook activates the subscription the moment it flips to PAID (Payment `subscriptionIntent` JSON + `intentConsumedAt` CAS), for onboarding **and** renew. The customer's next message is an idempotent fallback — never double-activates. Migration `20260618060000`.
- **BAC-04/CUS-09** — onboarding asks a day-of-week pattern and bills only delivery days (`countDeliveriesInRange`), matching renew/admin. Pattern parsing shared via `whatsapp/day-pattern.ts`.
- **EDG-03** — `POST /subscriptions` rejects a 2nd ACTIVE subscription per customer (409). WhatsApp path already extends, not duplicates.
- **DAT-09** — `Payment`/`Delivery` → `Customer` FKs are `onDelete: Restrict`; financial/delivery history can't be hard-deleted.
- **PER-09** — today's-deliveries uses the index-backed `(routeId, scheduledFor)` filter + a JS sort of the bounded per-route set (no un-indexed relational ORDER BY).
- **INT-08** — pin link built from `PUBLIC_PIN_BASE_URL → PUBLIC_BASE_URL → ADMIN_ORIGIN` so admin can be locked down.
- **INT-12** — `createRazorpayPaymentLink` → provider-agnostic `createPaymentLink`.

### Wave C — mobile (RN/Expo)
- **MOB-05** — same-day correction of a confirmed/skipped stop. New backend `POST /deliveries/:id/correct` (owning exec/admin, today-only) reverses + re-posts door cash and stamps an audit note; mobile re-opens any stop to correct (online-only).
- **MIL-06** re-scan-done informs (no duplicate sheet) · **MIL-07** capture door pin on skip too · **MIL-08** approximate-nav warning + empty-destination guard · **MIL-09** explicit "no route assigned" state · **MOB-07** web-token preview-only warning · **MOB-09** degraded offline boot from the cached identity · **MOB-11** network/timeout vs unknown-QR · **MOB-12** capture signal + retry-while-missing · **INT-07** release build fails loud without an https API base. MIL-03 confirmed already covered (MOB-06 0-L guard).

### Wave D — web-admin
- **WEB-09** litres validated client-side (`> 0`) · **ADM-07** area filter carries `Customer.area` through + filters that same field · **INT-09** mock fallback gated behind `NEXT_PUBLIC_DEMO=1` (prod outages surface as errors).

### Deploy
- **PRO-11** — `prisma` CLI moved to `dependencies` so `migrate deploy` survives a production prune. **PRO-10** Sentry sampling is env-configurable; **PRO-09** PgBouncer is a deployment note.

### Remaining = client-owned only
Real provider creds (payment/Meta/SMS), Redis provisioning, applying migrations to prod, hosting the `/pin` page, email-reset — see `docs/REMAINING_WORK.md` + the go-live checklist in `docs/PRODUCTION_READINESS.md`.

_Done in Batch 6: DAT-05 endDate, CUS-08/BAC-06 TZ, EDG-04/BAC-08 unrouted-active. Batch 7: SEC-03/ADM-04, DAT-10, ARC-08. Batch 8: PER-03/04/10. Batch 9: PER-06, MIL-04/MOB-10, MOB-04/06, product-name. Batch 10: WEB-02/03/13, ADM-06, ADM-03/08, password-change, WEB-08. Batch 11: §5.1.4/§7.4/§7.5/§9._

---

## Net-new PRD analytics (later batch) ⏭️
PRD-7.4 By-Route exec performance, 7.5 By-Customer adherence, 9.1/9.3/9.5 metric instrumentation, 5.1.4 reassignment-history table. Larger features — scheduled after Batch 3/4.

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
