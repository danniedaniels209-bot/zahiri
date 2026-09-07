import { PointsEntry } from '../models/Reward.js';
import { User } from '../models/User.js';

type Reason =
  | 'verification_submitted'
  | 'hub_post_approved'
  | 'resource_downloaded'
  | 'resource_liked'
  | 'game_session'
  | 'campaign_participation'
  | 'redemption'
  | 'adjustment';

/** Standing values for the reward system, kept in one place so they stay consistent. */
export const POINT_VALUES: Record<Reason, number> = {
  verification_submitted: 2,
  hub_post_approved: 25,
  resource_downloaded: 1,
  resource_liked: 2,
  game_session: 0, // scored per session, passed in explicitly
  campaign_participation: 50,
  redemption: 0, // negative, passed in explicitly
  adjustment: 0,
};

/**
 * Write to the ledger and update the cached balance together. The ledger is the
 * source of truth; `user.points` is a denormalised total for fast leaderboards.
 */
export async function award(
  userId: string,
  reason: Reason,
  delta = POINT_VALUES[reason],
  ref?: string,
  note = '',
) {
  if (!delta) return null;

  await PointsEntry.create({ user: userId, delta, reason, ref: ref ?? null, note });
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { points: delta }, $set: { lastActiveAt: new Date() } },
    { new: true },
  ).select('points');

  return user?.points ?? null;
}

/** Recompute a balance from the ledger, for repair or audit. */
export async function recomputeBalance(userId: string) {
  const [agg] = await PointsEntry.aggregate<{ total: number }>([
    { $match: { user: userId } },
    { $group: { _id: null, total: { $sum: '$delta' } } },
  ]);
  const total = agg?.total ?? 0;
  await User.findByIdAndUpdate(userId, { $set: { points: Math.max(0, total) } });
  return total;
}
