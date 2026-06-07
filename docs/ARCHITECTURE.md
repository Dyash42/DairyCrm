# Jharanai — Architecture

How the system fits together, where the seams are, and what you can
swap without touching the rest of the code.

---

## 30-second mental model

```
   Customer (WhatsApp)            Milkman (Flutter app)         Admin (Next.js)
          │                              │                            │
          │ Meta Cloud API               │ REST + JWT                 │ REST + JWT
          ▼                              ▼                            ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                       Fastify HTTP server                           │
   │   /auth · /customers · /routes · /executives · /deliveries ·        │
   │   /subscriptions · /broadcasts · /dashboard · /whatsapp/webhook     │
   └──────────────────────────────────────────────────────────────────────┘
                    │              │              │              │
                    ▼              ▼              ▼              ▼
              providers/      providers/    providers/      providers/
              payment         messaging     sms             storage
              (rzp/cf/stub)   (meta/stub)   (msg91/twilio)  (local/s3)
                    │              │              │              │
                    └──────────────┴──────────────┴──────────────┘
                                       │
                                       ▼
                              business services
                          (customer-code, qrcode,
                           subscription-calc,
                           scheduling)
                                       │
                                       ▼
                                    Prisma
                                       │
                                       ▼
                                  PostgreSQL
                              (Supabase in prod)
```

The arrows are the **only** coupling. Each layer talks to the one below
through a small explicit interface — never reaches around it.

---

## The 4 layers, in order of stability

| Layer | What lives here | How often it changes |
|---|---|---|
| **HTTP routes** (`src/modules/`) | Fastify endpoints, validation, auth guards | Often — every new feature |
| **Business services** (`src/services/`) | Customer code gen, QR gen, subscription calc, scheduling | Sometimes — when business rules shift |
| **Providers** (`src/providers/`) | Payment, messaging, SMS, storage adapters | Rarely — only when swapping a vendor |
| **Data** (`prisma/`) | Schema, migrations, seed | Carefully — under migration ceremony |

---

## Where the seams are (what's swappable, and how)

| You want to swap… | What changes | What stays the same |
|---|---|---|
| **Razorpay → Cashfree** (or any new gateway) | 1 env var + 1 new file under `providers/payment/` | All HTTP routes, all services, all UI |
| **Meta WhatsApp → BSP** (AiSensy / Wati) | 1 env var + 1 new file under `providers/messaging/` | The whole bot engine, all flows, all templates |
| **MSG91 → Twilio** SMS | `SMS_PROVIDER=twilio` + Twilio env vars | Everything else |
| **Local QR storage → S3 / R2** | `STORAGE_PROVIDER=s3` + S3 env vars | QR generator, customer module |
| **Fastify → another framework** (Express, Hono) | Replace `src/server.ts` and `src/modules/*/index.ts` route bindings; keep services + providers as-is | Business logic, Prisma, providers |
| **PostgreSQL → MySQL/another DB** | Change `provider` in `prisma/schema.prisma`, regenerate migrations | All HTTP routes + services (Prisma abstracts the dialect) |
| **Next.js admin → another SPA** | Re-implement `apps/web-admin` consuming the same REST API | Backend unchanged |
| **Flutter mobile → React Native** | Re-implement `apps/mobile` consuming the same REST API | Backend unchanged |

The rule of thumb: **if a vendor is named in our code outside
`src/providers/`, that's a bug.** Everything else imports the provider's
*interface*, not its implementation.

---

## Provider abstractions in detail

Every provider follows the same template:

```
src/providers/<domain>/
├── types.ts        ← the interface every implementation must satisfy
├── <vendor1>.ts    ← e.g. razorpay.ts
├── <vendor2>.ts    ← e.g. cashfree.ts
├── stub.ts         ← dev / CI fallback (always works)
└── index.ts        ← factory: `get<Domain>Provider()` picks one
```

### Resolution order (every factory)

1. **Explicit env**: `PAYMENT_PROVIDER=cashfree` wins.
2. **Auto-detect**: whichever vendor has its required creds set.
3. **Stub**: dev-safe fallback so the app boots without any creds.

This means a fresh `git clone` runs out of the box; pasting your
Razorpay creds into `.env` *instantly* makes it use Razorpay; swapping
to `PAYMENT_PROVIDER=cashfree` *instantly* makes it use Cashfree.

### Adding a new provider — 3 files, 1 import

1. **Implement** `src/providers/payment/yourgateway.ts` exporting a class
   that implements `PaymentProvider`.
2. **Register** it in `src/providers/payment/index.ts` (one new line in
   the factory).
3. **Document** the env vars in `apps/backend/.env.example`.

That's it. No call site changes anywhere.

---

## Constants, not magic numbers

All business numbers (rate per litre, OTP length, OTP expiry, rate
limits, QR error correction, renewal-reminder window) live in
`src/constants.ts`. Need to change the rupee rate? One file, one number.

Per-tenant overrides will eventually load from a `Settings` table at
startup and override these defaults — drop-in, no callers change.

---

## DRY patterns we've already pulled out

| Pattern | Where it used to repeat | Now |
|---|---|---|
| Phone normalization (`+91` default) | Auth + WhatsApp + tests | `utils/phone.ts` |
| UTC midnight + day arithmetic | Deliveries + dashboard + subscriptions + scheduling | `utils/dates.ts` |
| HTTP NotFound/Conflict/Forbidden + Prisma `P2002` detection | Every CRUD endpoint | `utils/http.ts` |
| API fetch with mock fallback | Dashboard + Routes + Customers | `apps/web-admin/src/hooks/useApiWithFallback.ts` |
| Meta payload building + HMAC verify | sender + webhook + tests | `providers/messaging/meta.ts` |

If you find a pattern repeating ≥3 times, that's the signal to extract
it. The SOP's audit habit is exactly this.

---

## Database — single shared schema, dialect-agnostic

`prisma/schema.prisma` is the only place that names tables/columns.
Switching the DB engine is a `provider = "mysql"` swap + new migrations;
all query code stays the same (Prisma writes the dialect for you).

---

## Frontend wiring

The admin's `lib/api.ts` is the *only* place that knows the backend's
URLs and shapes. Every screen calls a typed helper there
(`fetchDashboardMetrics`, `fetchRoutes`, …). To rename or move an
endpoint, edit one file.

`useApiWithFallback` keeps the mock data alive when the backend is
unreachable — so the design demo works without any deployment.

---

## Mobile wiring (current — will look like the admin once wired)

When mobile is fully wired:

```
apps/mobile/lib/
├── api/
│   ├── client.dart    ← Dio + JWT interceptor (= admin's lib/api.ts)
│   └── endpoints.dart ← typed helpers per resource
├── state/             ← Riverpod providers consume api/
└── storage/
    └── drift_db.dart  ← offline scan queue (Drift), sync engine
```

The pattern is identical to the admin: screens don't fetch directly,
they call `api/endpoints.dart` which goes through `client.dart`. To
change the backend host or auth scheme: edit `client.dart`.

---

## What we deliberately do NOT abstract

- **Prisma**: it IS our DB seam. Wrapping it would add a layer with no benefit.
- **React/Next**: same. We commit to one frontend framework per app.
- **Fastify**: same — one server framework. The routes are thin enough
  that swapping the framework is a 1–2 day job if needed.

Over-abstracting is its own bug. We abstract where vendors change
(payment, SMS, messaging, storage); we don't abstract our own choices.
