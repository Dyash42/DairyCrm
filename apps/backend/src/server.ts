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
import { getRedisOptional } from './redis';
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
import { registerLocationRoutes } from './modules/location';
import { registerAdminLogRoutes } from './modules/admin-log';
import { registerBotPromptRoutes } from './modules/bot-prompts';
import { warmBotPrompts } from './whatsapp/prompts';

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
    // Trust only the configured number of proxy hops (default 1) instead of
    // the entire X-Forwarded-For chain. With unconditional `true`, any client
    // could spoof XFF to get req.ip — and therefore a fresh rate-limit bucket
    // — on every request, defeating the per-IP brute-force limits on login/OTP.
    trustProxy: config.TRUST_PROXY,
  });

  // --- Plugins ---
  await app.register(cors, {
    // Production: strict allowlist (the configured admin origin only).
    // Development: also allow any localhost origin, since the Expo *web*
    // preview runs on a different port (e.g. http://localhost:8124) and the
    // browser enforces CORS. Native devices/emulators don't send Origin.
    origin:
      config.NODE_ENV === 'production'
        ? [config.ADMIN_ORIGIN]
        : (origin, cb) => {
            const ok =
              !origin ||
              origin === config.ADMIN_ORIGIN ||
              /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
            cb(null, ok);
          },
    credentials: true,
  });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  if (opts.rateLimited !== false) {
    // Back the limiter with Redis when available so per-IP limits hold ACROSS
    // instances and survive restarts (audit SEC-05/ARC-01: a per-process LRU
    // gave an attacker N× the attempts behind an N-pod load balancer and reset
    // every deploy). Falls back to the in-process store when REDIS_URL is unset.
    const redis = getRedisOptional();
    await app.register(rateLimit, {
      max: 200,
      timeWindow: '1 minute',
      ...(redis ? { redis } : {}),
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
  await app.register(registerLocationRoutes, { prefix: '/location' });
  await app.register(registerAdminLogRoutes, { prefix: '/admin-log' });
  await app.register(registerBotPromptRoutes, { prefix: '/bot-prompts' });

  // Warm the BotPrompt cache so flow handlers can call getPrompt() synchronously.
  // Safe to run lazily: if the table is empty (pre-seed), the cache is empty
  // and getPrompt() will throw "not found" — caught + surfaced by the global
  // error handler. After `npm run db:seed` the cache fills and flows resolve.
  await warmBotPrompts();

  return app;
}
