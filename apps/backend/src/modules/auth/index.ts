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

import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../prisma';
import { loadConfig } from '../../config';
import type { App } from '../../types';

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
 * Phone → { code, expiresAt }.
 * In production: store in Redis with the same shape so cross-process
 * verification works. Swap the implementation; the contract stays the same.
 */
const otpStore = new Map<string, { code: string; expiresAt: number }>();

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtp(phone: string, code: string): Promise<void> {
  const config = loadConfig();
  if (config.SMS_PROVIDER === 'console' || !config.SMS_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(`[auth] OTP for ${phone}: ${code}  (dev — set SMS_* to send real SMS)`);
    return;
  }
  // Real SMS provider integration plugs in here. Left as TODO so missing
  // creds don't break dev — the OTP is always logged so testers can see it.
  // eslint-disable-next-line no-console
  console.warn(`[auth] OTP send via ${config.SMS_PROVIDER} not yet implemented; printing instead: ${code}`);
}

// ----------------------- Routes -----------------------

export async function registerAuthRoutes(app: App) {
  // POST /auth/admin/login
  app.route({
    method: 'POST',
    url: '/admin/login',
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
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
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
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
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });
      await sendOtp(normalized, code);
      return { ok: true };
    },
  });

  // POST /auth/executive/otp/verify
  app.route({
    method: 'POST',
    url: '/executive/otp/verify',
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const { phone, code } = req.body as { phone: string; code: string };
      const normalized = normalizePhone(phone);
      const record = otpStore.get(normalized);
      if (!record || record.expiresAt < Date.now() || record.code !== code) {
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

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Default to India if no country code visible
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

// Exposed for tests
export const _otpStore = otpStore;
