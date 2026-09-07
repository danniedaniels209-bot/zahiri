import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { isProd } from '../config/env.js';

/**
 * Security middleware for the Zahiri API.
 *
 * Threat model this addresses:
 *  - NoSQL operator injection through JSON bodies and query strings
 *  - HTTP parameter pollution
 *  - Prompt injection carried inside user-supplied content
 *  - Upload spoofing (a .jpg that is really a script)
 *  - SSRF via attacker-controlled outbound URLs
 *  - Credential stuffing / brute force
 *  - Response header leakage
 */

// ---------------------------------------------------------------------------
// NoSQL injection
// ---------------------------------------------------------------------------

/**
 * Strip Mongo operators from anything a user sends. A body like
 * `{"email": {"$gt": ""}}` would otherwise match the first user in the
 * collection. Keys are cleaned in place rather than rejected so that ordinary
 * requests never break.
 */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 10 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // `$` starts a Mongo operator; `.` lets an attacker reach into a subdocument.
    if (key.startsWith('$') || key.includes('.')) continue;
    clean[key] = scrub(val, depth + 1);
  }
  return clean;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = scrub(req.body) as typeof req.body;
  }
  if (req.query && typeof req.query === 'object') {
    // Express 4 allows reassigning req.query; Express 5 does not, so mutate keys.
    for (const key of Object.keys(req.query)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete (req.query as Record<string, unknown>)[key];
      }
    }
  }
  next();
}

/**
 * HTTP parameter pollution: `?role=user&role=admin` arrives as an array and can
 * slip past a validator expecting a string. Keep the last value only.
 */
export function preventParamPollution(req: Request, _res: Response, next: NextFunction) {
  for (const [key, value] of Object.entries(req.query)) {
    if (Array.isArray(value)) {
      (req.query as Record<string, unknown>)[key] = value[value.length - 1];
    }
  }
  next();
}

// ---------------------------------------------------------------------------
// Request identity and audit logging
// ---------------------------------------------------------------------------

export interface TracedRequest extends Request {
  requestId?: string;
}

export function requestId(req: TracedRequest, res: Response, next: NextFunction) {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

type SecurityEvent =
  | 'auth.login.failed'
  | 'auth.login.success'
  | 'auth.lockout'
  | 'auth.register'
  | 'apikey.invalid'
  | 'apikey.quota_exceeded'
  | 'upload.rejected'
  | 'ssrf.blocked'
  | 'injection.detected';

/**
 * Security events go to stdout as structured JSON so Render's log drain (or any
 * SIEM pointed at it) can alert on them. Never log secrets or full tokens.
 */
export function logSecurityEvent(
  event: SecurityEvent,
  details: Record<string, unknown> = {},
) {
  console.warn(
    JSON.stringify({
      type: 'security',
      event,
      at: new Date().toISOString(),
      ...details,
    }),
  );
}

/** Truncated, non-reversible identifier for logging a subject without exposing it. */
export function pseudonymise(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// Brute force / credential stuffing
// ---------------------------------------------------------------------------

interface Attempt {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const LOCKOUT_MS = 15 * 60_000;

const attempts = new Map<string, Attempt>();

// Bound the map so a spray of unique identifiers cannot exhaust memory.
const MAX_TRACKED = 10_000;

function pruneAttempts(now: number) {
  if (attempts.size < MAX_TRACKED) return;
  for (const [key, a] of attempts) {
    if (a.lockedUntil < now && now - a.firstAt > WINDOW_MS) attempts.delete(key);
    if (attempts.size < MAX_TRACKED / 2) break;
  }
}

/** Returns the remaining lockout in ms, or 0 when the identity may proceed. */
export function checkLockout(identity: string): number {
  const record = attempts.get(identity);
  if (!record) return 0;
  const now = Date.now();
  if (record.lockedUntil > now) return record.lockedUntil - now;
  if (now - record.firstAt > WINDOW_MS) {
    attempts.delete(identity);
    return 0;
  }
  return 0;
}

export function recordFailure(identity: string): boolean {
  const now = Date.now();
  pruneAttempts(now);

  const record = attempts.get(identity) ?? { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - record.firstAt > WINDOW_MS) {
    record.count = 0;
    record.firstAt = now;
  }

  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    attempts.set(identity, record);
    logSecurityEvent('auth.lockout', { identity: pseudonymise(identity), attempts: record.count });
    return true;
  }

  attempts.set(identity, record);
  return false;
}

export function clearFailures(identity: string) {
  attempts.delete(identity);
}

// ---------------------------------------------------------------------------
// Timing-safe comparison
// ---------------------------------------------------------------------------

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the failure path costs the same.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

/** Magic-byte signatures. A declared MIME type is attacker-controlled; bytes are not. */
const SIGNATURES: { mime: RegExp; test: (b: Buffer) => boolean }[] = [
  { mime: /^image\/jpeg$/, test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: /^image\/png$/,
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: /^image\/gif$/, test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  {
    mime: /^image\/webp$/,
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: /^(video\/mp4|video\/quicktime|audio\/mp4|audio\/m4a)$/,
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
  },
  { mime: /^video\/webm$/, test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: /^audio\/ogg$/, test: (b) => b.subarray(0, 4).toString('ascii') === 'OggS' },
  {
    mime: /^audio\/mpeg$/,
    test: (b) => b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  },
  {
    mime: /^audio\/wav|audio\/x-wav$/,
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE',
  },
  { mime: /^image\/heic|image\/heif$/, test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
];

/** Payloads that must never be accepted even if the extension looks like media. */
const DANGEROUS_PREFIXES = [
  Buffer.from('MZ'), // Windows executable
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), // zip/apk/jar/office
  Buffer.from('<?php'),
  Buffer.from('#!/'),
  Buffer.from('<script'),
  Buffer.from('<!DOCTYPE'),
  Buffer.from('<svg'),
];

export interface UploadCheck {
  ok: boolean;
  reason?: string;
}

export function validateUpload(buffer: Buffer, declaredMime: string): UploadCheck {
  if (buffer.length < 12) return { ok: false, reason: 'File is too small to be valid media' };

  const head = buffer.subarray(0, 16);
  for (const bad of DANGEROUS_PREFIXES) {
    if (head.subarray(0, bad.length).equals(bad)) {
      return { ok: false, reason: 'This file is not media. It looks like an executable or script.' };
    }
  }

  const matcher = SIGNATURES.find((s) => s.mime.test(declaredMime));
  if (!matcher) {
    return { ok: false, reason: `Zahiri cannot check ${declaredMime} files` };
  }
  if (!matcher.test(buffer)) {
    return {
      ok: false,
      reason: 'The file contents do not match the file type it claims to be.',
    };
  }

  return { ok: true };
}

/** Strip directory components and control characters from a client filename. */
export function safeFilename(name: string): string {
  return (
    name
      .replace(/[\\/]/g, '_')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/^\.+/, '')
      .slice(0, 120) || 'upload'
  );
}

// ---------------------------------------------------------------------------
// SSRF
// ---------------------------------------------------------------------------

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/**
 * Guard for any outbound fetch built from data we did not author (the WhatsApp
 * media URL, for instance). Blocks non-HTTPS schemes and anything pointing at
 * private, loopback, or cloud-metadata addresses.
 */
export function assertSafeOutboundUrl(raw: string, allowedHosts: string[] = []): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Malformed outbound URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Outbound requests must use HTTPS');
  }

  const host = url.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host === '169.254.169.254' || // cloud instance metadata
    host === 'metadata.google.internal' ||
    PRIVATE_V4.test(host) ||
    host.startsWith('[') // raw IPv6 literal, including ::1 and fc00::/7
  ) {
    logSecurityEvent('ssrf.blocked', { host });
    throw new Error('Outbound request to a non-public address was blocked');
  }

  if (allowedHosts.length && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    logSecurityEvent('ssrf.blocked', { host, reason: 'not in allowlist' });
    throw new Error(`Outbound host ${host} is not allowed`);
  }

  return url;
}

// ---------------------------------------------------------------------------
// Prompt injection
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(your|the|all)\s+(instructions?|rules?|system\s+prompt)/i,
  /you\s+are\s+now\s+(a|an|in)\s+/i,
  /\bsystem\s*:\s*/i,
  /<\|(im_start|im_end|system|endoftext)\|>/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
  /\bDAN\b|\bjailbreak\b/i,
  /output\s+(your|the)\s+(api[_\s-]?key|secret|token|credentials)/i,
];

export interface SanitisedContent {
  text: string;
  suspicious: boolean;
  patterns: number;
}

/**
 * User content is data, never instruction. This neutralises the chat-template
 * control tokens outright and flags classic override phrasing so the caller can
 * log it. The content itself is still checked — a claim that happens to contain
 * "ignore previous instructions" is exactly the kind of thing people forward.
 */
export function sanitiseForPrompt(input: string, maxLength = 4000): SanitisedContent {
  let text = input.slice(0, maxLength);

  // Control tokens must never survive into the prompt.
  text = text.replace(/<\|[a-z_]+\|>/gi, '[removed]');

  const patterns = INJECTION_PATTERNS.filter((re) => re.test(text)).length;

  return { text, suspicious: patterns > 0, patterns };
}

/**
 * Wrap untrusted content in an explicit boundary. The system prompt tells the
 * model that anything inside the fence is material to judge, not orders to obey.
 */
export function fenceUntrusted(content: string): string {
  const nonce = crypto.randomBytes(8).toString('hex');
  return `<<<UNTRUSTED_CONTENT_${nonce}>>>\n${content}\n<<<END_UNTRUSTED_CONTENT_${nonce}>>>`;
}

// ---------------------------------------------------------------------------
// Response hardening
// ---------------------------------------------------------------------------

export function hardenResponses(_req: Request, res: Response, next: NextFunction) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
}

/**
 * Verify Meta's X-Hub-Signature-256 over the raw request body. Without this,
 * anyone who learns the webhook URL can inject fabricated "verified" traffic.
 */
export function verifyMetaSignature(appSecret: string) {
  return (req: Request & { rawBody?: Buffer }, res: Response, next: NextFunction) => {
    if (!appSecret) {
      // Fail closed in production; allow local development without Meta set up.
      if (isProd) {
        logSecurityEvent('injection.detected', { surface: 'whatsapp', reason: 'no app secret' });
        return res.status(503).json({ error: 'Webhook not configured' });
      }
      return next();
    }

    const header = req.header('x-hub-signature-256');
    if (!header?.startsWith('sha256=') || !req.rawBody) {
      logSecurityEvent('injection.detected', { surface: 'whatsapp', reason: 'missing signature' });
      return res.sendStatus(401);
    }

    const expected = crypto
      .createHmac('sha256', appSecret)
      .update(req.rawBody)
      .digest('hex');

    if (!timingSafeEqual(header.slice(7), expected)) {
      logSecurityEvent('injection.detected', { surface: 'whatsapp', reason: 'bad signature' });
      return res.sendStatus(401);
    }

    next();
  };
}

/** Reject oversized JSON bodies before the parser buffers them. */
export function limitBodySize(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > maxBytes) {
      return res.status(413).json({ error: 'Request body is too large' });
    }
    next();
  };
}
