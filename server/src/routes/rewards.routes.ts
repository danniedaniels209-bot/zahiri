import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { PointsEntry, Redemption, Reward } from '../models/Reward.js';
import { User } from '../models/User.js';
import { award } from '../utils/points.js';

const router = Router();

/** The reward catalogue. */
router.get(
  '/catalogue',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const user = await User.findById(req.userId).select('points tier').lean();
    const rewards = await Reward.find({ active: true }).sort({ costPoints: 1 }).lean();

    res.json({
      balance: user?.points ?? 0,
      tier: user?.tier ?? 'free',
      items: rewards.map((r) => ({
        ...r,
        affordable: (user?.points ?? 0) >= r.costPoints,
        locked: r.premiumOnly && user?.tier === 'free',
      })),
    });
  }),
);

/** Balance plus the ledger behind it, so the number is always explainable. */
router.get(
  '/balance',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const [user, entries] = await Promise.all([
      User.findById(req.userId).select('points tier').lean(),
      PointsEntry.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    res.json({
      balance: user?.points ?? 0,
      tier: user?.tier ?? 'free',
      ledger: entries,
    });
  }),
);

router.post(
  '/redeem/:rewardId',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const reward = await Reward.findOne({ _id: req.params.rewardId, active: true });
    if (!reward) throw new HttpError(404, 'Reward not found');

    const user = await User.findById(req.userId).select('points tier');
    if (!user) throw new HttpError(404, 'Account not found');

    if (reward.premiumOnly && user.tier === 'free') {
      throw new HttpError(403, 'This reward is for premium members');
    }
    if (user.points < reward.costPoints) {
      throw new HttpError(
        400,
        `You need ${reward.costPoints - user.points} more points to redeem this`,
      );
    }
    if (reward.stock === 0) throw new HttpError(409, 'This reward is out of stock');

    const redemption = await Redemption.create({
      user: req.userId,
      reward: reward.id,
      costPoints: reward.costPoints,
    });

    await award(req.userId!, 'redemption', -reward.costPoints, redemption.id, reward.title);
    if (reward.stock > 0) await Reward.updateOne({ _id: reward.id }, { $inc: { stock: -1 } });

    const updated = await User.findById(req.userId).select('points').lean();

    res.status(201).json({
      redemption,
      balance: updated?.points ?? 0,
      message: `Redeemed "${reward.title}". You will be contacted about fulfilment.`,
    });
  }),
);

router.get(
  '/redemptions',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const items = await Redemption.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate('reward', 'title description costPoints')
      .lean();
    res.json({ count: items.length, items });
  }),
);

/** Points leaderboard across the whole platform, not just the game. */
router.get(
  '/leaderboard',
  asyncRoute(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const users = await User.find({ points: { $gt: 0 } })
      .sort({ points: -1 })
      .limit(limit)
      .select('name role tier points')
      .lean();

    res.json({
      entries: users.map((u, i) => ({ rank: i + 1, ...u })),
    });
  }),
);

router.post(
  '/catalogue',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        slug: z.string().min(2),
        title: z.string().min(2),
        description: z.string().default(''),
        costPoints: z.number().min(0),
        stock: z.number().default(-1),
        premiumOnly: z.boolean().default(false),
      })
      .parse(req.body);

    res.status(201).json(await Reward.create(body));
  }),
);

export default router;
