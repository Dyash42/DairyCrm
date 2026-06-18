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
import { loadConfig } from '../../config';
import { getRedisOptional, isRedisEnabled } from '../../redis';
import { OTP_EXPIRY_MS, OTP_LENGTH, RATE_LIMITS } from '../../constants';
import { getSmsProvider } from '../../providers/sms';
import { normalizePhone } from '../../utils/phone';
import type { App } from '../../types';

/** Max wrong OTP attempts per phone before the code is invalidated. */
const MAX_OTP_ATTEMPTS = 5;

/** Max wrong PIN attempts before the account is locked (re-OTP to recover). */
const MAX_PIN_ATTEMPTS = 5;
/** How long a PIN stays locked after too many wrong attempts. */
const PIN_LOCK_MS = 15 * 60 * 1000;

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

/**
 * Verify the JWT is still backed by an ACTIVE user. A deactivated executive
 * otherwise kept full access until their (7-day) token expired — the audit
 * flagged this. Cached per-request so authenticate + requireRole on the same
 * request don't double-query the DB.
 */
async function ensureActiveUser(req: FastifyRequest): Promise<boolean> {
  const r = req as FastifyRequest & { _activeChecked?: boolean };
  if (r._activeChecked) return true;
  const u = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { active: true },
  });
  if (u?.active === true) {
    r._activeChecked = true;
    return true;
  }
  return false;
}

export async function registerAuthDecorators(app: App) {
  app.decorate('authenticate', async function (req, reply) {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (!(await ensureActiveUser(req))) {
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
      if (!(await ensureActiveUser(req))) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    };
  });
}

// ----------------------- OTP store (Redis when available) -----------------------

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

interface OtpStore {
  set(phone: string, rec: OtpRecord): Promise<void>;
  get(phone: string): Promise<OtpRecord | null>;
  delete(phone: string): Promise<void>;
}

/** Dev / single-instance fallback — resets on restart. */
class InMemoryOtpStore implements OtpStore {
  private readonly m = new Map<string, OtpRecord>();
  async set(phone: string, rec: OtpRecord): Promise<void> {
    this.m.set(phone, rec);
  }
  async get(phone: string): Promise<OtpRecord | null> {
    return this.m.get(phone) ?? null;
  }
  async delete(phone: string): Promise<void> {
    this.m.delete(phone);
  }
}

/**
 * Redis-backed OTP store (audit INT-01/EDG-09/SEC-05). Cross-instance so an
 * OTP requested on pod A verifies on pod B, the attempts counter aggregates
 * across pods (brute-force protection holds), and a restart no longer wipes
 * live codes. Redis TTL also auto-expires stale codes.
 */
class RedisOtpStore implements OtpStore {
  private key(phone: string): string {
    return `otp:${phone}`;
  }
  async set(phone: string, rec: OtpRecord): Promise<void> {
    const redis = getRedisOptional();
    if (!redis) return;
    const ttlSec = Math.max(1, Math.ceil((rec.expiresAt - Date.now()) / 1000));
    await redis.set(this.key(phone), JSON.stringify(rec), 'EX', ttlSec);
  }
  async get(phone: string): Promise<OtpRecord | null> {
    const redis = getRedisOptional();
    if (!redis) return null;
    const raw = await redis.get(this.key(phone));
    return raw ? (JSON.parse(raw) as OtpRecord) : null;
  }
  async delete(phone: string): Promise<void> {
    const redis = getRedisOptional();
    if (!redis) return;
    await redis.del(this.key(phone));
  }
}

const otpStore: OtpStore = isRedisEnabled() ? new RedisOtpStore() : new InMemoryOtpStore();

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

/**
 * A pre-computed bcrypt hash of a random string. We compare against this
 * when the user lookup misses, so bcrypt.compare always runs (and the
 * timing of the 401 response no longer reveals whether the email was
 * registered). The actual value doesn't matter — its only job is to
 * burn the same ~100ms bcrypt CPU cost that a real comparison would.
 */
const DUMMY_BCRYPT_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8iZsHnPwQu0vp.YjSHmJWmrJg0qH9G';

const AdminLoginBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

const AdminPasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

const OtpRequestBody = z.object({
  phone: z.string().min(10).max(20),
});

const OtpVerifyBody = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().regex(/^\d{4,8}$/),
});

/** A 4- or 6-digit numeric PIN. */
const PIN_REGEX = /^(\d{4}|\d{6})$/;
const PinSetBody = z.object({ pin: z.string().regex(PIN_REGEX) });
const PinVerifyBody = z.object({
  phone: z.string().min(10).max(20),
  pin: z.string().regex(PIN_REGEX),
});

export async function registerAuthRoutes(app: App) {
  // POST /auth/admin/login
  app.route({
    method: 'POST',
    url: '/admin/login',
    config: { rateLimit: { max: RATE_LIMITS.auth.max, timeWindow: RATE_LIMITS.auth.timeWindowMs } },
    handler: async (req, reply) => {
      // Strict Zod parse instead of `as`-cast. Without this, a body
      // like `{ email: { startsWith: "a" } }` reaches Prisma and a
      // PrismaClientValidationError throws — leaking 500 (vs 401)
      // becomes an oracle on whether the email type was accepted.
      const { email, password } = AdminLoginBody.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email } });
      const eligible =
        Boolean(user) && user!.role === 'ADMIN' && user!.active && Boolean(user!.passwordHash);
      // ALWAYS run bcrypt.compare — against the real hash if the user
      // exists & is eligible, otherwise against a dummy hash. This
      // closes the user-enumeration timing oracle (~100ms gap that
      // previously revealed whether an admin email was registered).
      const hashToCheck = eligible && user!.passwordHash ? user!.passwordHash : DUMMY_BCRYPT_HASH;
      const ok = await bcrypt.compare(password, hashToCheck);
      if (!eligible || !ok) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const token = await reply.jwtSign({
        sub: user!.id,
        role: 'ADMIN',
        name: user!.name,
      } as JwtPayload);
      return { token, user: { id: user!.id, name: user!.name, role: user!.role } };
    },
  });

  // POST /auth/admin/password — authenticated self-service password change.
  // Requires the CURRENT password (re-auth), so a stolen-but-idle session
  // can't silently change it. No email reset flow yet (needs an email
  // provider — tracked); this covers the admin rotating their own password.
  app.route({
    method: 'POST',
    url: '/admin/password',
    preHandler: app.requireRole('ADMIN'),
    config: { rateLimit: { max: RATE_LIMITS.auth.max, timeWindow: RATE_LIMITS.auth.timeWindowMs } },
    handler: async (req, reply) => {
      const { currentPassword, newPassword } = AdminPasswordBody.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
      if (!user || !user.passwordHash) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }
      if (newPassword === currentPassword) {
        return reply
          .status(422)
          .send({ error: 'New password must be different from the current one' });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      return { ok: true };
    },
  });

  // POST /auth/executive/otp/request
  app.route({
    method: 'POST',
    url: '/executive/otp/request',
    config: { rateLimit: { max: RATE_LIMITS.auth.max, timeWindow: RATE_LIMITS.auth.timeWindowMs } },
    handler: async (req, reply) => {
      const { phone } = OtpRequestBody.parse(req.body);
      const normalized = normalizePhone(phone);

      const user = await prisma.user.findUnique({ where: { phone: normalized } });
      if (!user || user.role !== 'EXECUTIVE' || !user.active) {
        // Don't leak which phones are registered.
        return reply.status(200).send({ ok: true });
      }

      const code = genOtp();
      await otpStore.set(normalized, {
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
      const { phone, code } = OtpVerifyBody.parse(req.body);
      const normalized = normalizePhone(phone);

      // Static-pin bypass: when no real SMS provider is wired, a configured
      // pin (AUTH_STATIC_OTP) logs the executive in without a sent OTP. Gated
      // to registered, active executives only. Constant-time compared.
      const staticPin = loadConfig().AUTH_STATIC_OTP;
      if (staticPin && safeEqual(staticPin, code)) {
        const u = await prisma.user.findUnique({ where: { phone: normalized } });
        if (!u || u.role !== 'EXECUTIVE' || !u.active) {
          return reply.status(401).send({ error: 'Invalid credentials' });
        }
        const token = await reply.jwtSign({
          sub: u.id,
          role: 'EXECUTIVE',
          name: u.name,
        } as JwtPayload);
        return { token, user: { id: u.id, name: u.name, role: u.role }, pinSet: Boolean(u.pinHash) };
      }

      const record = await otpStore.get(normalized);
      if (!record || record.expiresAt < Date.now()) {
        await otpStore.delete(normalized);
        return reply.status(401).send({ error: 'Invalid or expired OTP' });
      }
      // Increment attempts BEFORE comparing — protects against the
      // attacker giving up halfway through a brute-force burst.
      record.attempts += 1;
      if (record.attempts > MAX_OTP_ATTEMPTS) {
        await otpStore.delete(normalized);
        return reply.status(429).send({
          error: 'Too many attempts. Please request a fresh OTP.',
        });
      }
      if (!safeEqual(record.code, code)) {
        await otpStore.set(normalized, record); // persist the bumped attempts
        return reply.status(401).send({ error: 'Invalid or expired OTP' });
      }
      await otpStore.delete(normalized);

      const user = await prisma.user.findUnique({ where: { phone: normalized } });
      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = await reply.jwtSign({
        sub: user.id,
        role: 'EXECUTIVE',
        name: user.name,
      } as JwtPayload);
      return { token, user: { id: user.id, name: user.name, role: user.role }, pinSet: Boolean(user.pinHash) };
    },
  });

  // POST /auth/executive/pin/set — set/replace the device-unlock PIN. Requires
  // a valid EXECUTIVE JWT (i.e. the user just authenticated via OTP). After
  // this the mobile app unlocks with the PIN instead of requesting an OTP each
  // launch (audit-driven preferred auth model).
  app.route({
    method: 'POST',
    url: '/executive/pin/set',
    preHandler: app.requireRole('EXECUTIVE'),
    handler: async (req, reply) => {
      const { pin } = PinSetBody.parse(req.body);
      const pinHash = await bcrypt.hash(pin, 10);
      await prisma.user.update({
        where: { id: req.user.sub },
        data: { pinHash, pinSetAt: new Date(), pinFailedAttempts: 0, pinLockedUntil: null },
      });
      return { ok: true };
    },
  });

  // POST /auth/executive/pin/verify — unlock with phone + PIN, returns a JWT.
  // Lockout after MAX_PIN_ATTEMPTS wrong tries (recover via OTP). Same per-IP
  // rate limit as OTP verify.
  app.route({
    method: 'POST',
    url: '/executive/pin/verify',
    config: { rateLimit: { max: RATE_LIMITS.authVerify.max, timeWindow: RATE_LIMITS.authVerify.timeWindowMs } },
    handler: async (req, reply) => {
      const { phone, pin } = PinVerifyBody.parse(req.body);
      const normalized = normalizePhone(phone);
      const user = await prisma.user.findUnique({ where: { phone: normalized } });
      // Uniform 401 whether the user is missing, ineligible, or has no PIN —
      // don't leak which phones are registered / PIN-enabled.
      if (!user || user.role !== 'EXECUTIVE' || !user.active || !user.pinHash) {
        return reply.status(401).send({ error: 'Invalid PIN' });
      }
      if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
        return reply.status(429).send({
          error: 'PIN locked after too many attempts. Log in with OTP to reset.',
        });
      }
      const ok = await bcrypt.compare(pin, user.pinHash);
      if (!ok) {
        const attempts = user.pinFailedAttempts + 1;
        const lock = attempts >= MAX_PIN_ATTEMPTS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            pinFailedAttempts: lock ? 0 : attempts,
            pinLockedUntil: lock ? new Date(Date.now() + PIN_LOCK_MS) : null,
          },
        });
        return reply.status(lock ? 429 : 401).send({
          error: lock
            ? 'Too many wrong PINs. Locked — log in with OTP to reset.'
            : 'Invalid PIN',
        });
      }
      // Success — clear the failure counters and issue a fresh token.
      if (user.pinFailedAttempts !== 0 || user.pinLockedUntil) {
        await prisma.user.update({
          where: { id: user.id },
          data: { pinFailedAttempts: 0, pinLockedUntil: null },
        });
      }
      const token = await reply.jwtSign({
        sub: user.id,
        role: 'EXECUTIVE',
        name: user.name,
      } as JwtPayload);
      return { token, user: { id: user.id, name: user.name, role: user.role }, pinSet: true };
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
