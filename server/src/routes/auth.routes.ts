import { Router } from 'express';
import { z } from 'zod';
import { User, hashPassword, type UserDoc } from '../models/User.js';
import { requireAuth, signToken, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  checkLockout,
  clearFailures,
  logSecurityEvent,
  pseudonymise,
  recordFailure,
} from '../middleware/security.js';

const router = Router();

/** A short denylist of passwords that show up in every credential-stuffing list. */
const COMMON_PASSWORDS = new Set([
  'password123456',
  'qwerty123456',
  '123456789012',
  'passw0rd1234',
  'administrator',
  'zahiri123456',
  'letmein12345',
]);

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password is too long')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/\d/, 'Password must include a number')
    .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), 'That password is too common'),
  language: z.string().default('en'),
  country: z.string().default('NG'),
  // 'factchecker' and 'admin' are deliberately absent: privileged roles are
  // only ever granted server-side, never chosen at sign-up.
  role: z.enum(['user', 'ambassador', 'journalist', 'org']).default('user'),
});

function publicUser(u: Record<string, unknown>) {
  const { passwordHash, __v, ...rest } = u as Record<string, unknown> & { passwordHash?: string };
  return rest;
}

router.post(
  '/register',
  authLimiter,
  asyncRoute(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await User.findOne({ email: body.email }).lean();
    if (existing) throw new HttpError(409, 'An account with that email already exists');

    logSecurityEvent('auth.register', { email: pseudonymise(body.email), ip: req.ip });

    const user = await User.create({
      name: body.name,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      language: body.language,
      country: body.country,
      role: body.role,
    });

    res.status(201).json({
      token: signToken(user.id),
      user: publicUser(user.toObject()),
    });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncRoute(async (req, res) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);

    const identity = `${body.email}|${req.ip ?? 'unknown'}`;
    const lockedFor = checkLockout(identity);
    if (lockedFor > 0) {
      throw new HttpError(
        429,
        `Too many failed sign-in attempts. Try again in ${Math.ceil(lockedFor / 60000)} minutes.`,
      );
    }

    const user = (await User.findOne({ email: body.email }).select('+passwordHash')) as UserDoc | null;
    const passwordOk = user ? await user.checkPassword(body.password) : false;

    if (!user || !passwordOk) {
      const nowLocked = recordFailure(identity);
      logSecurityEvent('auth.login.failed', {
        email: pseudonymise(body.email),
        ip: req.ip,
        locked: nowLocked,
      });
      // The same message for both cases, so the response cannot be used to
      // enumerate which email addresses have accounts.
      throw new HttpError(401, 'Email or password is incorrect');
    }

    clearFailures(identity);
    logSecurityEvent('auth.login.success', { userId: pseudonymise(user.id), ip: req.ip });

    user.lastActiveAt = new Date();
    await user.save();

    res.json({ token: signToken(user.id), user: publicUser(user.toObject()) });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const user = await User.findById(req.userId).lean();
    if (!user) throw new HttpError(404, 'Account not found');
    res.json({ user: publicUser(user) });
  }),
);

router.patch(
  '/me',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        name: z.string().min(2).max(80).optional(),
        language: z.string().optional(),
        country: z.string().optional(),
        topics: z.array(z.string()).optional(),
        whatsappNumber: z.string().nullable().optional(),
        accessibility: z
          .object({
            signLanguage: z.boolean().optional(),
            largeText: z.boolean().optional(),
            highContrast: z.boolean().optional(),
            audioReadout: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(req.body);

    const update: Record<string, unknown> = { ...body };
    if (body.accessibility) {
      delete update.accessibility;
      for (const [k, v] of Object.entries(body.accessibility)) {
        if (v !== undefined) update[`accessibility.${k}`] = v;
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, { $set: update }, { new: true }).lean();
    if (!user) throw new HttpError(404, 'Account not found');
    res.json({ user: publicUser(user) });
  }),
);

export default router;
