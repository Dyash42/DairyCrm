/**
 * Auth module — JWT for admins, phone+OTP for executives.
 *
 * /auth/admin/login           — email + password → JWT
 * /auth/executive/otp/request — phone → 6-digit OTP (printed/sent)
 * /auth/executive/otp/verify  — phone + code → JWT
 *
 * Decorators:
 *   app.authenticate     — requires any valid JWT
 *   app.requireRole(...) — requires one of the listed roles
 */

import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../prisma';
import { OTP_EXPIRY_MS, OTP_LENGTH, RATE_LIMITS } from '../../constants';
import { getSmsProvider } from '../../providers/sms';
import { normalizePhone } from '../../utils/phone';
import type { App } from '../../types';

/** Max wrong OTP attempts per phone before the code is invalidated. */
const MAX_OTP_ATTEMPTS = 5;

// ----------------------- Token payload + decorators -----------------------

export type JwtRole = 'ADMIN' | 'EXECUTIVE';

export interface JwtPayload {
  sub: string; // user id
  role: JwtRole;
  name: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireRole(
      ...roles: JwtRole[]
    ): (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuthDecorators(app: App) {
  app.decorate('authenticate', async function (req, reply) {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.decorate('requireRole', function (...roles: JwtRole[]) {
    return async function (req: FastifyRequest, reply: FastifyReply) {
      try {
        await req.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!roles.includes(req.user.role)) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    };
  });
}

// ----------------------- In-process OTP store (dev fallback) -----------------------

/**
 * Phone → { code, expiresAt, attempts }.
 * In production: store in Redis with the same shape so cross-process
 * verification works. Swap the implementation; the contract stays the same.
 */
const otpStore = new Map<
  string,
  { code: string; expiresAt: number; attempts: number }
>();

function genOtp(): string {
  // crypto.randomInt is uniform + cryptographically secure. Math.random is
  // neither — an attacker who watches enough generated codes can predict
  // the next one (V8 uses xorshift128+).
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(min, max));
}

/** Constant-time string comparison — no early return on first mismatch. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

async function sendOtp(phone: string, code: string): Promise<void> {
  await getSmsProvider().sendOtp(phone, code).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[auth] OTP send failed; falling back to log', err);
    // eslint-disable-next-line no-console
    console.log(`[auth] OTP for ${phone}: ${code}`);
  });
}

// ----------------------- Routes -----------------------

export async function registerAuthRoutes(app: App) {
  // POST /auth/admin/login
  app.route({
    method: 'POST',
    url: '/admin/login',
    config: { rateLimit: { max: RATE_LIMITS.auth.max, timeWindow: RATE_LIMITS.auth.timeWindowMs } },
    handler: async (req, reply) => {
      const { email, password } = req.body as { email: string; password: string };
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || user.role !== 'ADMIN' || !user.active || !user.passwordHash) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const token = await reply.jwtSign({
        sub: user.id,
        role: 'ADMIN',
        name: user.name,
      } as JwtPayload);
      return { token, user: { id: user.id, name: user.name, role: user.role } };
    },
  });

  // POST /auth/executive/otp/request
  app.route({
    method: 'POST',
    url: '/executive/otp/request',
    config: { rateLimit: { max: RATE_LIMITS.auth.max, timeWindow: RATE_LIMITS.auth.timeWindowMs } },
    handler: async (req, reply) => {
      const { phone } = req.body as { phone: string };
      const normalized = normalizePhone(phone);

      const user = await prisma.user.findUnique({ where: { phone: normalized } });
      if (!user || user.role !== 'EXECUTIVE' || !user.active) {
        // Don't leak which phones are registered.
        return reply.status(200).send({ ok: true });
      }

      const code = genOtp();
      otpStore.set(normalized, {
        code,
        expiresAt: Date.now() + OTP_EXPIRY_MS,
        attempts: 0,
      });
      await sendOtp(normalized, code);
      return { ok: true };
    },
  });

  // POST /auth/executive/otp/verify
  app.route({
    method: 'POST',
    url: '/executive/otp/verify',
    config: { rateLimit: { max: RATE_LIMITS.authVerify.max, timeWindow: RATE_LIMITS.authVerify.timeWindowMs } },
    handler: async (req, reply) => {
      const { phone, code } = req.body as { phone: string; code: string };
      const normalized = normalizePhone(phone);
      const record = otpStore.get(normalized);
      if (!record || record.expiresAt < Date.now()) {
        otpStore.delete(normalized);
        return reply.status(401).send({ error: 'Invalid or expired OTP' });
      }
      // Increment attempts BEFORE comparing — protects against the
      // attacker giving up halfway through a brute-force burst.
      record.attempts += 1;
      if (record.attempts > MAX_OTP_ATTEMPTS) {
        otpStore.delete(normalized);
        return reply.status(429).send({
          error: 'Too many attempts. Please request a fresh OTP.',
        });
      }
      if (!safeEqual(record.code, code)) {
        otpStore.set(normalized, record); // persist the bumped attempts
        return reply.status(401).send({ error: 'Invalid or expired OTP' });
      }
      otpStore.delete(normalized);

      const user = await prisma.user.findUnique({ where: { phone: normalized } });
      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = await reply.jwtSign({
        sub: user.id,
        role: 'EXECUTIVE',
        name: user.name,
      } as JwtPayload);
      return { token, user: { id: user.id, name: user.name, role: user.role } };
    },
  });

  // GET /auth/me — useful for client to validate the token
  app.route({
    method: 'GET',
    url: '/me',
    preHandler: app.authenticate,
    handler: async (req) => {
      return { user: req.user };
    },
  });
}

// Exposed for tests
export const _otpStore = otpStore;
