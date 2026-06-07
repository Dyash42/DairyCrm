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
import { ZodError } from 'zod';

import { loadConfig } from './config';
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

export interface BuildOptions {
  /** Skip rate limit in tests (it pollutes 200 fast-fire requests). */
  rateLimited?: boolean;
}

export async function buildServer(opts: BuildOptions = {}): Promise<App> {
  const config = loadConfig();
  const app = Fastify({
    logger:
      config.NODE_ENV === 'production'
        ? { level: 'info' }
        : { level: 'warn' },
    disableRequestLogging: true,
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

  return app;
}
