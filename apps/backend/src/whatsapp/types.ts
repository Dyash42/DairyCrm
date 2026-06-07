/**
 * WhatsApp bot — shared types for the conversation engine.
 *
 * The conversation engine is provider-agnostic: it consumes `InboundMessage`
 * events and produces `OutboundAction[]`. A "sender" implementation maps
 * those actions to Meta Cloud API calls (see ./sender.ts).
 */

// ---------- Inbound (what we receive) ----------

export type InboundMessage =
  | { kind: 'text'; from: string; text: string; messageId: string; timestamp: number }
  | { kind: 'button'; from: string; payload: string; title: string; messageId: string; timestamp: number }
  | { kind: 'list'; from: string; rowId: string; title: string; messageId: string; timestamp: number }
  | { kind: 'image' | 'document' | 'audio' | 'video'; from: string; mediaId: string; messageId: string; timestamp: number };

// ---------- Outbound (what we send) ----------

export type OutboundAction =
  | { kind: 'text'; to: string; body: string }
  | { kind: 'template'; to: string; templateName: string; variables?: Record<string, string>; mediaUrl?: string }
  | {
      kind: 'buttons';
      to: string;
      body: string;
      buttons: Array<{ id: string; title: string }>; // max 3
    }
  | {
      kind: 'list';
      to: string;
      body: string;
      buttonText: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    }
  | { kind: 'image'; to: string; mediaUrl: string; caption?: string };

// ---------- Conversation state ----------

/**
 * Where each customer phone number is in the bot.
 * Persisted in Redis (key `wa:session:<phone>`), in-memory fallback for dev.
 */
export interface ConversationState {
  phone: string;
  flow: FlowName | null;
  step: string | null;
  context: Record<string, unknown>; // collected slots (name, address, etc.)
  customerId?: string; // once linked to a Customer row
  updatedAt: number;
  /** Auto-expire after 24h of inactivity. */
  expiresAt: number;
}

export type FlowName =
  | 'onboarding'
  | 'menu'
  | 'renew'
  | 'pause'
  | 'resume'
  | 'support';

// ---------- Flow handler contract ----------

export interface FlowContext {
  message: InboundMessage;
  state: ConversationState;
  /** Mutate state by returning a partial — engine merges + persists. */
  patchState(patch: Partial<ConversationState>): void;
  /** Queue an outbound action. The engine sends after the handler returns. */
  send(action: OutboundAction): void;
  /** Lookup helpers (resolved against backend repos in production). */
  repos: BotRepos;
}

export interface BotRepos {
  findCustomerByPhone(phone: string): Promise<{ id: string; name: string; code: string } | null>;
  createCustomer(input: {
    phone: string;
    name: string;
    addressLine1: string;
    email?: string;
    altPhone?: string;
    litresPerDay: number;
  }): Promise<{ id: string; code: string; qrCodeUrl: string }>;
  createPaymentLink(input: {
    customerId: string;
    amount: number;
    note: string;
  }): Promise<{ url: string }>;
  activateSubscription(input: {
    customerId: string;
    litresPerDay: number;
    daysOfWeek: number[];
    durationDays: number;
  }): Promise<{ subscriptionId: string }>;
  pauseSubscription(input: {
    customerId: string;
    startDate: string;
    endDate: string;
  }): Promise<void>;
  resumeSubscription(customerId: string): Promise<void>;
  logSupportTicket(input: {
    customerId: string;
    kind: string;
    note: string;
    creditApplied?: number;
  }): Promise<void>;
  /**
   * Read the customer's currently active subscription, if any.
   * Used by renew/resume flows so they don't quote stale or hard-coded values.
   */
  getActiveSubscription(customerId: string): Promise<{
    id: string;
    litresPerDay: number;
    ratePerLitre: number;
    daysOfWeek: number[];
    endDate: Date | null;
  } | null>;
  /** Read the customer's open pause (if currently paused). */
  getActivePause(customerId: string): Promise<{
    startDate: Date;
    endDate: Date;
  } | null>;
}

/** Top-level entry: process one inbound message → return outbound actions. */
export interface FlowHandler {
  /** Should this flow handle the message? */
  matches(ctx: FlowContext): boolean | Promise<boolean>;
  /** Execute one step of the flow. */
  handle(ctx: FlowContext): Promise<void>;
}
