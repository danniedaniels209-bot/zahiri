import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import {
  requireApiKey,
  requireAuth,
  requireRole,
  type AuthedRequest,
} from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { ApiClient } from '../models/ApiClient.js';
import { verifyClaim } from '../services/verify/engine.js';
import { extractDomain, scoreDomain } from '../services/verify/reputation.js';
import { Alert } from '../models/Alert.js';

const router = Router();

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const makePrefix = customAlphabet(alphabet, 8);
const makeSecret = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  40,
);

/**
 * Newsroom & NGO API (B2B tier). Issued keys look like `zah_<prefix>_<secret>`;
 * only the prefix and a bcrypt hash of the secret are stored, so the full key is
 * shown exactly once at creation.
 */
router.post(
  '/clients',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        orgName: z.string().min(2),
        contactEmail: z.string().email(),
        plan: z.enum(['trial', 'newsroom', 'ngo', 'enterprise']).default('trial'),
        monthlyQuota: z.number().min(1).default(500),
        scopes: z.array(z.string()).default(['verify:text', 'verify:link', 'read:crisis']),
      })
      .parse(req.body);

    const prefix = makePrefix();
    const secret = makeSecret();

    const now = new Date();
    const client = await ApiClient.create({
      ...body,
      keyPrefix: prefix,
      keyHash: await bcrypt.hash(secret, 10),
      quotaResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    });

    res.status(201).json({
      client: { id: client.id, orgName: client.orgName, plan: client.plan, keyPrefix: prefix },
      apiKey: `zah_${prefix}_${secret}`,
      warning: 'Store this key now. It cannot be shown again.',
    });
  }),
);

router.get(
  '/clients',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (_req, res) => {
    const items = await ApiClient.find().sort({ createdAt: -1 }).lean();
    res.json({ count: items.length, items });
  }),
);

router.delete(
  '/clients/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const client = await ApiClient.findByIdAndUpdate(
      req.params.id,
      { $set: { active: false } },
      { new: true },
    );
    if (!client) throw new HttpError(404, 'Client not found');
    res.json({ revoked: true, orgName: client.orgName });
  }),
);

// ---------------------------------------------------------------------------
// Public B2B surface: authenticated with x-api-key, metered against the quota.
// ---------------------------------------------------------------------------

router.get('/v1/whoami', requireApiKey, asyncRoute(async (req: AuthedRequest, res) => {
  const client = await ApiClient.findById(req.apiClientId).lean();
  res.json({
    orgName: client?.orgName,
    plan: client?.plan,
    scopes: client?.scopes,
    quota: { monthly: client?.monthlyQuota, used: client?.usedThisMonth, resetsAt: client?.quotaResetAt },
  });
}));

router.post(
  '/v1/verify',
  requireApiKey,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        claim: z.string().min(3).max(4000),
        language: z.string().default('en'),
      })
      .parse(req.body);

    const result = await verifyClaim(body.claim, {
      userId: null,
      language: body.language,
      entryPoint: 'api',
    });

    res.json({
      id: result.id,
      verdict: result.verdict,
      confidence: result.confidence,
      explanation: result.explanation,
      evidence: result.evidence,
      sourceReputation: result.reputation,
      humanReviewQueued: result.humanReview.required,
      model: result.aiModel,
    });
  }),
);

router.get(
  '/v1/source',
  requireApiKey,
  asyncRoute(async (req, res) => {
    const raw = z.string().min(3).parse(req.query.url ?? req.query.domain);
    const domain = extractDomain(raw);
    if (!domain) throw new HttpError(400, 'Invalid domain or URL');
    res.json(await scoreDomain(domain));
  }),
);

router.get(
  '/v1/crisis',
  requireApiKey,
  asyncRoute(async (req, res) => {
    const region = (req.query.region as string) || 'NG';
    const items = await Alert.find({ active: true, isCrisis: true, region })
      .sort({ circulationScore: -1 })
      .limit(50)
      .select('title summary correction verdict circulationScore sources publishedAt')
      .lean();
    res.json({ region, count: items.length, items });
  }),
);

export default router;
