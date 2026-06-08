/**
 * Fastify server factory.
 *
 * Why Fastify (not NestJS): the NestJS install ran into a transitive
 * resolution issue with terser-webpack-plugin; Fastify is leaner, has
 * native TypeScript support, async-first plugins, and faster cold-start.
 *
 * Validation: handlers do `Schema.parse(req.body)` (and querystring/params).
 * The global error handler converts ZodError → 422 with a clean shape.
 *
 * Exported as a factory so tests can spin up an isolated app per case
 * without process.env or singleton pollution.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import pino from 'pino';
import { ZodError } from 'zod';

import { loadConfig } from './config';
import { buildLogStreams } from './log-streams';
import type { App } from './types';
import { registerAuthRoutes, registerAuthDecorators } from './modules/auth';
import { registerCustomerRoutes } from './modules/customers';
import { registerRouteRoutes } from './modules/routes';
import { registerExecutiveRoutes } from './modules/executives';
import { registerDeliveryRoutes } from './modules/deliveries';
import { registerSubscriptionRoutes } from './modules/subscriptions';
import { registerBroadcastRoutes } from './modules/broadcasts';
import { registerDashboardRoutes } from './modules/dashboard';
import { registerWhatsAppRoutes } from './modules/whatsapp';
import { registerHealthRoutes } from './modules/health';
import { registerBillingRoutes } from './modules/billing';
import { registerSettingsRoutes } from './modules/settings';
import { registerProductRoutes } from './modules/products';
import { registerPaymentRoutes } from './modules/payments';
import { registerAdminLogRoutes } from './modules/admin-log';

export interface BuildOptions {
  /** Skip rate limit in tests (it pollutes 200 fast-fire requests). */
  rateLimited?: boolean;
}

export async function buildServer(opts: BuildOptions = {}): Promise<App> {
  const config = loadConfig();

  // Pino path-redact: hides authorization headers + obvious PII fields from
  // every log line. The "*.phone" wildcards cover req.body.phone,
  // payload.customer.phone, etc. Pair with the scrub-phones serializer below
  // for any phone-like substring inside `msg` strings.
  const redactPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-razorpay-signature"]',
    'req.headers["x-webhook-signature"]',
    'req.headers["x-hub-signature-256"]',
    'req.body.password',
    'req.body.phone',
    'req.body.altPhone',
    'req.body.otp',
    'req.body.code',
    '*.phone',
    '*.altPhone',
    '*.otp',
  ];

  // Multiplex log lines to BOTH stdout AND apps/backend/logs/server.log.
  // The file persists across restarts so we can grep for what happened
  // during a broken flow even after the dev terminal scrolled away.
  // Returns undefined in tests so vitest doesn't accumulate a log file.
  const streams = buildLogStreams();
  const level = config.NODE_ENV === 'production' ? 'info' : 'info';
  const loggerOptions = {
    level,
    redact: { paths: redactPaths, censor: '[redacted]' },
  };
  const app = Fastify({
    logger: streams
      ? pino(loggerOptions, pino.multistream(streams))
      : loggerOptions,
    // We DO want per-request logging now — that's the whole point of
    // capturing logs for debugging. Each request gets one access-log
    // line with method + url + status + responseTime.
    disableRequestLogging: false,
    trustProxy: true,
  });

  // --- Plugins ---
  await app.register(cors, {
    origin: [config.ADMIN_ORIGIN],
    credentials: true,
  });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  if (opts.rateLimited !== false) {
    await app.register(rateLimit, {
      max: 200,
      timeWindow: '1 minute',
    });
  }

  await registerAuthDecorators(app);

  // --- Error handler ---
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(422).send({
        error: 'ValidationError',
        details: err.format(),
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error');
    }
    return reply.status(status).send({
      error: err.name || 'InternalServerError',
      message: status >= 500 ? 'Internal server error' : err.message,
    });
  });

  // --- Routes ---
  await app.register(registerHealthRoutes);
  await app.register(registerAuthRoutes, { prefix: '/auth' });
  await app.register(registerCustomerRoutes, { prefix: '/customers' });
  await app.register(registerRouteRoutes, { prefix: '/routes' });
  await app.register(registerExecutiveRoutes, { prefix: '/executives' });
  await app.register(registerDeliveryRoutes, { prefix: '/deliveries' });
  await app.register(registerSubscriptionRoutes, { prefix: '/subscriptions' });
  await app.register(registerBroadcastRoutes, { prefix: '/broadcasts' });
  await app.register(registerDashboardRoutes, { prefix: '/dashboard' });
  await app.register(registerWhatsAppRoutes, { prefix: '/whatsapp' });
  await app.register(registerBillingRoutes, { prefix: '/billing' });
  await app.register(registerSettingsRoutes, { prefix: '/settings' });
  await app.register(registerProductRoutes, { prefix: '/products' });
  await app.register(registerPaymentRoutes, { prefix: '/payments' });
  await app.register(registerAdminLogRoutes, { prefix: '/admin-log' });

  return app;
}
