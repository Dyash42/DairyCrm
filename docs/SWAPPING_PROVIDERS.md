# Swapping providers

Concrete recipes for the most common vendor swaps. Every recipe is
**1 env var + (sometimes) 1 new file**. No call-site changes anywhere.

If a recipe here doesn't work as advertised, that's a bug — please open
an issue or fix the seam.

---

## 1. Razorpay → Cashfree

You decided to move payments to Cashfree (or you're piloting a sister
brand on a different gateway).

**What to do:**

```bash
# In apps/backend/.env
PAYMENT_PROVIDER=cashfree
CASHFREE_APP_ID=<your-app-id>
CASHFREE_SECRET_KEY=<your-secret>
CASHFREE_WEBHOOK_SECRET=<your-webhook-secret>
CASHFREE_ENV=production    # or sandbox during testing
```

Restart the server. Every flow that previously used Razorpay (WhatsApp
onboarding, renew, future admin "send link" buttons) now uses Cashfree.
The bot, admin, and mobile do not know any of this changed.

**What you do NOT need to touch:**

- Bot flows (`src/whatsapp/flows/*`) — they call `createPaymentLink`,
  which is the provider-agnostic alias.
- REST endpoints — none of them name a gateway.
- Admin UI — payment URLs are just strings to it.

**Why this works:** every gateway implements `PaymentProvider`. The
factory in `src/providers/payment/index.ts` picks based on
`PAYMENT_PROVIDER` (or auto-detects by which keys are present).

---

## 2. Add a brand-new payment gateway (e.g. PhonePe)

**Three files:**

### 2.1 `src/providers/payment/phonepe.ts`

```ts
import { loadConfig } from '../../config';
import type { PaymentLink, PaymentLinkInput, PaymentProvider } from './types';

export class PhonePePaymentProvider implements PaymentProvider {
  readonly name = 'phonepe' as const;

  get isConfigured(): boolean {
    const c = loadConfig();
    return Boolean(c.PHONEPE_MERCHANT_ID && c.PHONEPE_SALT_KEY);
  }

  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLink> {
    // ... PhonePe API call ...
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    // ... PhonePe HMAC scheme ...
  }
}
```

### 2.2 `src/providers/payment/index.ts`

Add to the factory:

```ts
import { PhonePePaymentProvider } from './phonepe';
// ...
if (explicit === 'phonepe') return (cached = new PhonePePaymentProvider());
// ...auto-detect: add `if (phonepe.isConfigured) return ...`
```

### 2.3 `src/config.ts`

Add the new env vars to the zod schema:

```ts
PHONEPE_MERCHANT_ID: z.string().optional(),
PHONEPE_SALT_KEY: z.string().optional(),
```

And update `PAYMENT_PROVIDER` enum to include `'phonepe'`.

### 2.4 `apps/backend/.env.example`

Document the keys:

```env
PHONEPE_MERCHANT_ID=
PHONEPE_SALT_KEY=
```

**Done.** No call site changes. Switch with `PAYMENT_PROVIDER=phonepe`.

---

## 3. Meta WhatsApp → BSP (AiSensy / Wati / Interakt / Gupshup)

**What to do:**

```bash
# In apps/backend/.env
MESSAGING_PROVIDER=aisensy    # or wati / interakt / gupshup
AISENSY_API_KEY=<...>
```

(BSPs typically don't sign their webhooks the way Meta does — their
provider impl returns true for valid keys, false otherwise.)

Build a new provider class similar to Section 2 above:
- `src/providers/messaging/aisensy.ts` implementing `MessagingProvider`
- Register it in `src/providers/messaging/index.ts`
- Add env vars to `config.ts` + `.env.example`

**Code that does not change:** the conversation engine, every flow
(onboarding/renew/pause/resume/support), every template, the webhook
route's HTTP handling — none of them name "Meta".

---

## 4. MSG91 → Twilio for executive OTP

**What to do:**

```bash
# In apps/backend/.env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=<...>
TWILIO_AUTH_TOKEN=<...>
TWILIO_FROM=+14155551234
```

That's it. The auth module calls `getSmsProvider().sendOtp(...)` and
gets whichever provider is configured. Both providers are already
implemented in `src/providers/sms/`.

**To add another SMS vendor** (Plivo, Karix, etc.) follow the same
recipe as Section 2.

---

## 5. Local QR storage → Cloudflare R2 (or AWS S3)

**What to do:**

```bash
# In apps/backend/.env
STORAGE_PROVIDER=r2       # or s3
S3_BUCKET=jharanai-prod
S3_ACCESS_KEY=<...>
S3_SECRET_KEY=<...>
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_REGION=auto            # for R2; for AWS use the bucket's region
```

**Implementation:** the S3 provider skeleton in
`src/providers/storage/s3.ts` is currently a stub. To finish it:

```bash
npm install -w @jharanai/backend @aws-sdk/client-s3
```

Then replace the throw in `upload()` with a `PutObjectCommand` call.
That's the only change. The QR generator and customer code already use
`getStorageProvider()`.

---

## 6. Fastify → Express (or Hono, or any other framework)

This is bigger but still local. The recipe:

1. **Replace** `src/server.ts` with an Express bootstrap (or whatever).
2. **For each `src/modules/<x>/index.ts`** convert the
   `app.route({...})` + `handler` calls into your new framework's
   equivalent. Each handler body is just `req.body`, `req.params`,
   `req.query`, `reply.status().send(...)` — boring framework glue.
3. The whole `src/services/`, `src/providers/`, `src/whatsapp/` tree
   stays untouched.

Realistic effort: **1–2 days** of mechanical translation. There's no
hidden Fastify coupling in our services or providers.

---

## 7. PostgreSQL → MySQL (or another Prisma-supported DB)

**What to do:**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "mysql"   // was: "postgresql"
  url      = env("DATABASE_URL")
}
```

Then:

```bash
cd apps/backend
rm -rf prisma/migrations    # MySQL DDL differs from Postgres
npx prisma migrate dev --name init
```

**Caveats:**
- Postgres arrays (used in `Route.pinCodes`) become a separate join
  table on MySQL — Prisma will guide you through this.
- `@db.Date`, `@db.Decimal(p,s)` etc. all have MySQL equivalents.
- Some indexes may need to be rewritten.

The query-level code (every `prisma.x.findMany(...)`) stays the same —
Prisma writes the dialect for you.

---

## 8. Switching the admin or mobile UI framework

**Admin** (currently Next.js): re-implement `apps/web-admin` consuming
the same REST API. The backend doesn't care. All endpoint URLs +
shapes are in `apps/web-admin/src/lib/api.ts` for reference.

**Mobile** (currently Flutter): same idea — re-implement
`apps/mobile` in React Native (or whatever) calling the same REST API.

---

## Rule of thumb

> If you can't make the swap in **1 env var + ≤3 files**, the seam is
> wrong. Open a PR fixing it before doing the swap.

Every recipe here was authored under that constraint and is the source
of truth.
