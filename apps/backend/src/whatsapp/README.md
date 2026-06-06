# WhatsApp bot — code structure

This folder is the **conversation engine + flow handlers + sender** for the
Jharanai WhatsApp bot. It is provider-agnostic: it consumes inbound events
and produces outbound actions. The only thing tied to Meta Cloud API is
`sender.ts` and `webhook.ts`.

Right now everything works against **stub repos** (`repos.ts`) and a
**stub sender** (`sender.ts` — drops messages if `META_*` env vars are
missing). When you wire real Meta credentials and real Prisma repos, no
flow logic changes.

## Files

| File | Role |
| --- | --- |
| `types.ts` | Shared types — InboundMessage, OutboundAction, ConversationState, FlowContext, BotRepos |
| `templates.ts` | All Meta-template definitions (12+ templates matching the design PDF) |
| `session-store.ts` | Conversation state persistence — in-memory now, Redis later |
| `engine.ts` | Routes inbound messages → flow handler → persists state → sends outbox |
| `webhook.ts` | Meta webhook GET (verify) + POST (events) handlers, framework-agnostic |
| `sender.ts` | Meta Cloud API client — stub today, throws on missing creds |
| `payment.ts` | Razorpay payment-link generator — stub |
| `repos.ts` | Backend lookups used by flows — stubbed, replace with Prisma calls |
| `index.ts` | Public exports |
| `flows/menu.ts` | Returning-customer menu (Renew / Pause / Resume / Support) |
| `flows/onboarding.ts` | New customer → name/address/email/altPhone/qty/days → payment → activate |
| `flows/renew.ts` | Days of week → quote → payment → schedule updated |
| `flows/pause.ts` | Start date → end date → confirm → auto-resume scheduled |
| `flows/resume.ts` | Early-resume choice → resume tomorrow |
| `flows/support.ts` | Missed-delivery → credit applied |

## Architecture in one diagram

```
Customer sends WhatsApp message
            │
            ▼
   Meta Cloud API webhook  ──── POST → /whatsapp/webhook
            │
            ▼
   webhook.ts handleWebhook()
            │
            ▼
        engine.process(inbound)
            │
   ┌────────┼──────────────┐
   │        │              │
   ▼        ▼              ▼
sessionStore  FlowHandler  outbox: OutboundAction[]
  .get()       .handle()       │
                               ▼
                         sender.sendBatch() ──── POST → Meta Graph API
```

## How to wire when Meta credentials arrive

1. Fill in `META_*` env vars from `apps/backend/.env.example`.
2. Replace `sender.ts`'s `// TODO` block with a real `fetch` to
   `https://graph.facebook.com/{version}/{phoneNumberId}/messages`.
3. Set up the webhook URL in Meta App → WhatsApp → Configuration. Point
   it at `https://api.jharanai.com/whatsapp/webhook`. Add the
   `META_VERIFY_TOKEN` (any random string you invent) to .env too.
4. Submit the templates in `templates.ts` via WhatsApp Manager →
   Message Templates. Names + variable counts must match exactly.
5. Swap `InMemorySessionStore` for a `RedisSessionStore` (use the
   `REDIS_URL` env var).
6. Replace `stubRepos` in `engine.ts` with a real Prisma-backed
   implementation (`PrismaBotRepos extends BotRepos`).
7. Add a NestJS module that wraps `verifyWebhook`/`handleWebhook` as
   `@Get` and `@Post` route handlers.

## How to test before Meta is live

```ts
import { engine } from './whatsapp';

await engine.process({
  kind: 'text',
  from: '+919999999999',
  text: 'Hi',
  messageId: 'test-1',
  timestamp: Date.now(),
});
```

You'll see `[wa] outbound (stub)` log lines for every message the bot
"would have sent". The conversation state lives in-memory.

## Templates and Meta approval

Each entry in `TEMPLATES` corresponds to a record you must submit to Meta
for approval (WhatsApp Manager → Message Templates → New). They typically
approve in a few hours.

**Tip:** submit them in parallel with business verification so you don't
serialize the waiting.

## Costs reminder

- Customer-initiated messages (i.e. anything that flows from a customer
  saying "Hi") within 24h: **FREE** (since July 2025).
- Business-initiated UTILITY (auto-resume reminders, daily delivery
  confirmations): **~₹0.115/message**.
- Avoid MARKETING category — ~₹0.86/message and outside the customer-
  service window anyway.

See `docs/Jharanai_CRM_Solution_Steps_v2.docx` §8 for the full math.
