import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiClient } from '../models/ApiClient.js';
import { logSecurityEvent, pseudonymise } from './security.js';

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
  apiClientId?: string;
}

const JWT_ISSUER = 'zahiri-api';
const JWT_AUDIENCE = 'zahiri-app';

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: 'HS256',
  });
}

/** Verify with the algorithm pinned, so a token cannot claim `alg: none`. */
function verifyToken(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256'],
  }) as { sub: string };
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Requires a logged-in app user. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select('role').lean();
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });

    req.userId = payload.sub;
    req.userRole = user.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

/** Attaches the user when a token is present, but does not reject anonymous callers. */
export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    const user = await User.findById(payload.sub).select('role').lean();
    req.userRole = user?.role;
  } catch {
    // An invalid token on an optional route is treated as anonymous, not an error.
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'You do not have access to this action' });
    }
    next();
  };
}

/** B2B tier: `x-api-key: zah_<prefix>_<secret>` with a monthly quota. */
export async function requireApiKey(req: AuthedRequest, res: Response, next: NextFunction) {
  const raw = req.header('x-api-key');
  if (!raw) return res.status(401).json({ error: 'Missing x-api-key header' });

  const parts = raw.split('_');
  if (parts.length !== 3 || parts[0] !== 'zah') {
    return res.status(401).json({ error: 'Malformed API key' });
  }
  const [, prefix, secret] = parts;

  const client = await ApiClient.findOne({ keyPrefix: prefix, active: true }).select('+keyHash');

  // Always run a bcrypt comparison, even when the prefix is unknown, so the
  // response time does not reveal whether the prefix exists.
  const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const ok = await bcrypt.compare(secret, client?.keyHash ?? DUMMY_HASH);

  if (!client || !ok) {
    logSecurityEvent('apikey.invalid', { prefix: pseudonymise(prefix), ip: req.ip });
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const now = new Date();
  if (client.quotaResetAt < now) {
    client.usedThisMonth = 0;
    client.quotaResetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  if (client.usedThisMonth >= client.monthlyQuota) {
    logSecurityEvent('apikey.quota_exceeded', { orgName: client.orgName });
    return res.status(429).json({
      error: 'Monthly quota exhausted',
      quota: client.monthlyQuota,
      resetsAt: client.quotaResetAt,
    });
  }

  client.usedThisMonth += 1;
  client.lastUsedAt = now;
  await client.save();

  req.apiClientId = client.id;
  res.setHeader('X-Quota-Remaining', String(client.monthlyQuota - client.usedThisMonth));
  next();
}
