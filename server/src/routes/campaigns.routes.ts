import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { Campaign, TrainingModule } from '../models/Campaign.js';
import { RadioPartner } from '../models/RadioPartner.js';
import { award } from '../utils/points.js';

const router = Router();

/** Youth-Led School Sensitisation Campaigns. */
router.get(
  '/',
  optionalAuth,
  asyncRoute(async (req, res) => {
    const query = z
      .object({
        status: z.enum(['planned', 'confirmed', 'completed', 'cancelled']).optional(),
        state: z.string().optional(),
        upcoming: z.coerce.boolean().default(false),
        limit: z.coerce.number().min(1).max(100).default(30),
      })
      .parse(req.query);

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.state) filter.state = query.state;
    if (query.upcoming) filter.scheduledFor = { $gte: new Date() };

    const items = await Campaign.find(filter)
      .sort({ scheduledFor: query.upcoming ? 1 : -1 })
      .limit(query.limit)
      .populate('ambassadors', 'name role')
      .lean();

    res.json({ count: items.length, items });
  }),
);

/** Reach figures across all completed campaigns. */
router.get(
  '/impact',
  asyncRoute(async (_req, res) => {
    const [totals] = await Campaign.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          campaigns: { $sum: 1 },
          studentsReached: { $sum: '$studentsReached' },
          teachersTrained: { $sum: '$teachersTrained' },
          schools: { $addToSet: '$school' },
        },
      },
      {
        $project: {
          _id: 0,
          campaigns: 1,
          studentsReached: 1,
          teachersTrained: 1,
          schoolCount: { $size: '$schools' },
        },
      },
    ]);

    res.json(
      totals ?? { campaigns: 0, studentsReached: 0, teachersTrained: 0, schoolCount: 0 },
    );
  }),
);

router.post(
  '/',
  requireAuth,
  requireRole('ambassador', 'admin', 'org'),
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        school: z.string().min(2),
        state: z.string().default(''),
        city: z.string().default(''),
        scheduledFor: z.coerce.date(),
        modules: z.array(z.string()).optional(),
        notes: z.string().default(''),
      })
      .parse(req.body);

    const campaign = await Campaign.create({ ...body, ambassadors: [req.userId] });
    res.status(201).json(campaign);
  }),
);

/** An ambassador joins a planned campaign. */
router.post(
  '/:id/join',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) throw new HttpError(404, 'Campaign not found');
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new HttpError(409, 'This campaign is closed');
    }

    const already = campaign.ambassadors.some((a) => a.toString() === req.userId);
    if (already) throw new HttpError(409, 'You have already joined this campaign');

    campaign.ambassadors.push(req.userId as never);
    await campaign.save();

    res.json({ campaign, message: 'You are on the team for this campaign.' });
  }),
);

/** Closing out a campaign records its reach and pays every ambassador. */
router.post(
  '/:id/complete',
  requireAuth,
  requireRole('ambassador', 'admin', 'org'),
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        studentsReached: z.number().min(0).default(0),
        teachersTrained: z.number().min(0).default(0),
        notes: z.string().default(''),
      })
      .parse(req.body);

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) throw new HttpError(404, 'Campaign not found');
    if (campaign.status === 'completed') throw new HttpError(409, 'Already completed');

    campaign.status = 'completed';
    campaign.studentsReached = body.studentsReached;
    campaign.teachersTrained = body.teachersTrained;
    campaign.notes = body.notes;
    await campaign.save();

    for (const ambassadorId of campaign.ambassadors) {
      await award(
        ambassadorId.toString(),
        'campaign_participation',
        undefined,
        campaign.id,
        campaign.school,
      );
    }

    res.json({ campaign });
  }),
);

/** Training modules, used in schools and in-app. */
router.get(
  '/modules',
  asyncRoute(async (req, res) => {
    const level = req.query.level as string | undefined;
    const filter = level ? { level } : {};
    const items = await TrainingModule.find(filter).sort({ level: 1, title: 1 }).lean();
    res.json({ count: items.length, items });
  }),
);

router.get(
  '/modules/:slug',
  asyncRoute(async (req, res) => {
    const item = await TrainingModule.findOne({ slug: req.params.slug }).lean();
    if (!item) throw new HttpError(404, 'Module not found');
    res.json(item);
  }),
);

/** Radio partnerships, for communities with limited internet access. */
router.get(
  '/radio',
  asyncRoute(async (req, res) => {
    const state = req.query.state as string | undefined;
    const filter: Record<string, unknown> = { active: true };
    if (state) filter.state = state;

    const items = await RadioPartner.find(filter).sort({ state: 1, station: 1 }).lean();
    res.json({ count: items.length, items });
  }),
);

export default router;
