import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { Alert } from '../models/Alert.js';
import { User } from '../models/User.js';

const router = Router();

/**
 * Daily Updates & Alerts. When the caller is signed in and passes no explicit
 * topics, their saved topic preferences drive the feed.
 */
router.get(
  '/',
  optionalAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const query = z
      .object({
        topics: z.string().optional(),
        region: z.string().optional(),
        language: z.string().optional(),
        limit: z.coerce.number().min(1).max(50).default(20),
        skip: z.coerce.number().min(0).default(0),
      })
      .parse(req.query);

    let topics = query.topics?.split(',').map((t) => t.trim()).filter(Boolean);

    if (!topics?.length && req.userId) {
      const user = await User.findById(req.userId).select('topics country language').lean();
      topics = user?.topics?.length ? user.topics : undefined;
      if (!query.region && user?.country) query.region = user.country;
      if (!query.language && user?.language) query.language = user.language;
    }

    const filter: Record<string, unknown> = { active: true, isCrisis: false };
    if (topics?.length) filter.topic = { $in: topics };
    if (query.region) filter.region = query.region;
    if (query.language) filter.language = query.language;

    const [items, total] = await Promise.all([
      Alert.find(filter)
        .sort({ publishedAt: -1 })
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      Alert.countDocuments(filter),
    ]);

    res.json({ total, count: items.length, personalised: Boolean(topics?.length), items });
  }),
);

/**
 * Election & Crisis Rapid-Response Mode: the most-circulating false claims right
 * now, ranked by circulation, each paired with its correction.
 */
router.get(
  '/crisis',
  asyncRoute(async (req, res) => {
    const query = z
      .object({
        region: z.string().default('NG'),
        limit: z.coerce.number().min(1).max(50).default(20),
      })
      .parse(req.query);

    const items = await Alert.find({ active: true, isCrisis: true, region: query.region })
      .sort({ circulationScore: -1, publishedAt: -1 })
      .limit(query.limit)
      .lean();

    res.json({
      mode: items.length > 0 ? 'active' : 'standby',
      region: query.region,
      count: items.length,
      items,
    });
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const alert = await Alert.findOne({ _id: req.params.id, active: true }).lean();
    if (!alert) throw new HttpError(404, 'Alert not found');
    res.json(alert);
  }),
);

/** Fact-checkers and admins publish into the feed and the crisis desk. */
router.post(
  '/',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(5).max(200),
        summary: z.string().min(10).max(1000),
        body: z.string().default(''),
        topic: z
          .enum(['health', 'education', 'civic', 'local', 'election', 'crisis', 'general'])
          .default('general'),
        verdict: z.enum(['verified', 'false', 'misleading', 'unverified']).default('verified'),
        isCrisis: z.boolean().default(false),
        circulationScore: z.number().min(0).max(100).default(0),
        correction: z.string().default(''),
        region: z.string().default('NG'),
        language: z.string().default('en'),
        sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
        signLanguageVideoUrl: z.string().nullable().default(null),
        audioUrl: z.string().nullable().default(null),
      })
      .parse(req.body);

    const alert = await Alert.create(body);
    res.status(201).json(alert);
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        circulationScore: z.number().min(0).max(100).optional(),
        correction: z.string().optional(),
        active: z.boolean().optional(),
        isCrisis: z.boolean().optional(),
      })
      .parse(req.body);

    const alert = await Alert.findByIdAndUpdate(req.params.id, { $set: body }, { new: true });
    if (!alert) throw new HttpError(404, 'Alert not found');
    res.json(alert);
  }),
);

export default router;
