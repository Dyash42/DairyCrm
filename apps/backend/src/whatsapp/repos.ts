/**
 * Backend repos used by flow handlers.
 *
 * Each method is a STUB. Replace with real Prisma queries when wiring up
 * the actual NestJS modules.
 */

import type { BotRepos } from './types';

let stubCounter = 100500;

export const stubRepos: BotRepos = {
  async findCustomerByPhone(_phone) {
    return null; // stub: always treat as new customer
  },

  async createCustomer(input) {
    stubCounter += 1;
    const code = `JHR-${stubCounter}`;
    return {
      id: `stub-${stubCounter}`,
      code,
      qrCodeUrl: `https://stub.invalid/qr/${code}.png`,
    };
  },

  async createPaymentLink(input) {
    return {
      url: `https://rzp.io/l/stub-${encodeURIComponent(input.note)}-${input.amount}`,
    };
  },

  async activateSubscription(_input) {
    return { subscriptionId: `sub-stub-${Date.now()}` };
  },

  async pauseSubscription(_input) {
    return;
  },

  async resumeSubscription(_customerId) {
    return;
  },

  async logSupportTicket(_input) {
    return;
  },
};
