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

import { onboardingFlow } from './flows/onboarding';
import { menuFlow } from './flows/menu';
import { renewFlow } from './flows/renew';
import { pauseFlow } from './flows/pause';
import { resumeFlow } from './flows/resume';
import { supportFlow } from './flows/support';

const FLOWS: FlowHandler[] = [
  // Order matters: the first matching flow wins.
  // Active flows take priority over the menu, so an in-progress onboarding
  // doesn't get hijacked by a new 'Hi'.
  onboardingFlow,
  renewFlow,
  pauseFlow,
  resumeFlow,
  supportFlow,
  menuFlow, // catch-all for new conversations
];

export class ConversationEngine {
  constructor(
    private readonly repos: BotRepos = stubRepos,
    private readonly senderImpl: WhatsAppSender = sender,
  ) {}

  async process(message: InboundMessage): Promise<void> {
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

    for (const flow of FLOWS) {
      const matched = await Promise.resolve(flow.matches(ctx));
      if (matched) {
        await flow.handle(ctx);
        break;
      }
    }

    await sessionStore.set(nextState);
    await this.senderImpl.sendBatch(outbox);
  }
}

export const engine = new ConversationEngine();
