/**
 * Conversation engine — routes inbound messages to the right flow handler.
 *
 * The engine is dumb: it loads state, picks a handler, lets the handler
 * mutate state and queue outbound actions, then persists state and sends.
 * All product logic lives in flows/.
 */

import type {
  BotRepos,
  ConversationState,
  FlowContext,
  FlowHandler,
  InboundMessage,
  OutboundAction,
} from './types';
import { freshState, sessionStore } from './session-store';
import { sender, type WhatsAppSender } from './sender';
import { stubRepos } from './repos';
import { getRedisOptional } from '../redis';

import { onboardingFlow } from './flows/onboarding';
import { menuFlow } from './flows/menu';
import { renewFlow } from './flows/renew';
import { pauseFlow } from './flows/pause';
import { resumeFlow } from './flows/resume';
import { supportFlow } from './flows/support';
import { locationFlow } from './flows/location';

const FLOWS: FlowHandler[] = [
  // Order matters: the first matching flow wins.
  // A shared WhatsApp location updates the customer's door pin from any state.
  locationFlow,
  // Active flows take priority over the menu, so an in-progress onboarding
  // doesn't get hijacked by a new 'Hi'.
  onboardingFlow,
  renewFlow,
  pauseFlow,
  resumeFlow,
  supportFlow,
  menuFlow, // catch-all for new conversations
];

/**
 * Idempotency cache: Meta retries webhooks aggressively. If the same
 * messageId hits us twice (because we 200'd slowly or Meta got confused),
 * we MUST NOT run flows twice — that would charge the customer twice or
 * advance their FSM state to a place they didn't intend.
 *
 * Production (REDIS_URL set): atomic `SET NX EX` on `wa:dedupe:<msgId>` so a
 * retry that lands on ANOTHER instance (or after a restart) is still suppressed
 * — the in-memory Map was per-process and lost on restart (audit EDG-01/BAC-10).
 * Dev / no-Redis: bounded in-memory set, survives within the process.
 */
const PROCESSED_IDS_TTL_MS = 10 * 60 * 1000; // 10 minutes is plenty for Meta retries
const PROCESSED_IDS_TTL_SEC = PROCESSED_IDS_TTL_MS / 1000;
const PROCESSED_IDS_MAX = 5_000;
const processedIds = new Map<string, number>(); // messageId -> expiresAt

async function alreadyProcessed(messageId: string): Promise<boolean> {
  const redis = getRedisOptional();
  if (redis) {
    // SET key 1 EX ttl NX → 'OK' when newly set (not seen), null when it
    // already existed (duplicate). Atomic + cross-instance.
    const res = await redis.set(`wa:dedupe:${messageId}`, '1', 'EX', PROCESSED_IDS_TTL_SEC, 'NX');
    return res === null;
  }
  // In-memory fallback. Lazy GC of expired entries when we hit the cap.
  if (processedIds.size > PROCESSED_IDS_MAX) {
    const now = Date.now();
    for (const [k, exp] of processedIds) {
      if (exp < now) processedIds.delete(k);
    }
  }
  const exp = processedIds.get(messageId);
  if (exp && exp > Date.now()) return true;
  processedIds.set(messageId, Date.now() + PROCESSED_IDS_TTL_MS);
  return false;
}

/** Exposed for tests so they can reset state between cases. */
export function _resetIdempotencyForTests(): void {
  processedIds.clear();
}

/**
 * Per-phone serialization lock (audit ARC-03).
 *
 * process() does a non-atomic read-modify-write: sessionStore.get → run flow →
 * sessionStore.set. Two inbound messages from the SAME phone arriving close
 * together (Meta can deliver concurrently across instances) would both read the
 * same state and the second set() would clobber the first transition.
 *
 * Fix: hold a short Redis lock `wa:lock:<from>` (SET NX PX) for the duration of
 * processing so handlers for one phone run one-at-a-time across all instances.
 * If we can't grab it (a concurrent handler owns it), retry briefly; if still
 * locked, skip — Meta will redeliver. When Redis is null we're single-instance,
 * so no lock is needed and behaviour is unchanged.
 */
const LOCK_TTL_MS = 10_000; // safety TTL so a crashed handler can't wedge a phone forever
const LOCK_RETRY_ATTEMPTS = 5;
const LOCK_RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try to acquire the per-phone lock, retrying a few times. Returns a release
 * function on success, or null if the phone stayed locked (caller should skip).
 */
async function acquirePhoneLock(from: string): Promise<(() => Promise<void>) | null> {
  const redis = getRedisOptional();
  if (!redis) {
    // Single-instance: no contention possible, behave exactly as before.
    return async () => {};
  }
  const key = `wa:lock:${from}`;
  for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
    // SET key 1 PX ttl NX → 'OK' when newly acquired, null when already held.
    const res = await redis.set(key, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (res === 'OK') {
      return async () => {
        await redis.del(key);
      };
    }
    if (attempt < LOCK_RETRY_ATTEMPTS - 1) await sleep(LOCK_RETRY_DELAY_MS);
  }
  return null;
}

export class ConversationEngine {
  constructor(
    private readonly repos: BotRepos = stubRepos,
    private readonly senderImpl: WhatsAppSender = sender,
  ) {}

  async process(message: InboundMessage): Promise<void> {
    // Idempotency — drop duplicates from Meta retries.
    if (await alreadyProcessed(message.messageId)) {
      return;
    }

    // Per-phone lock so concurrent inbound messages from the same phone can't
    // interleave the read-modify-write below and lose a transition (audit ARC-03).
    const release = await acquirePhoneLock(message.from);
    if (!release) {
      // A concurrent handler owns this phone; skip — Meta will redeliver.
      return;
    }

    try {
      const state = (await sessionStore.get(message.from)) ?? freshState(message.from);

      const outbox: OutboundAction[] = [];
      let nextState: ConversationState = { ...state };

      const ctx: FlowContext = {
        message,
        state,
        patchState: (patch) => {
          nextState = { ...nextState, ...patch, updatedAt: Date.now() };
        },
        send: (action) => {
          outbox.push(action);
        },
        repos: this.repos,
      };

      let handled = false;
      for (const flow of FLOWS) {
        const matched = await Promise.resolve(flow.matches(ctx));
        if (matched) {
          await flow.handle(ctx);
          handled = true;
          break;
        }
      }

      // Onboarding-completion nudge (audit CUS-11). If NO flow matched, the
      // message fell through to silence — this only happens when the session is
      // fresh/expired (flow === null) AND the inbound is not a greeting/menu
      // trigger the menuFlow recognises (and not a location, which locationFlow
      // always takes). A customer who abandoned onboarding and replies a bare
      // answer like "2" >24h later lands here; without a nudge the bot looks
      // dead. Active-flow routing and the normal greeting path already matched
      // above, so they never reach this branch.
      if (!handled) {
        ctx.send({
          kind: 'text',
          to: message.from,
          body: "Sorry, I didn't catch that. Let's start over — send \"Hi\" to begin.",
        });
      }

      await sessionStore.set(nextState);
      await this.senderImpl.sendBatch(outbox);
    } finally {
      await release();
    }
  }
}

export const engine = new ConversationEngine();
