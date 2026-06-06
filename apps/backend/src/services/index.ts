/**
 * Backend services — pure (or thinly-Prisma-wrapped) business logic.
 * Imported by the WhatsApp bot flows, future REST controllers, and cron jobs.
 */

export * from './customer-code';
export * from './qrcode';
export * from './subscription-calc';
export * from './scheduling';
