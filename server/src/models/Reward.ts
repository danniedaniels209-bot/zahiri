import { Schema, model } from 'mongoose';

/** Append-only points ledger backing the reward system. */
const pointsEntrySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: [
        'verification_submitted',
        'hub_post_approved',
        'resource_downloaded',
        'resource_liked',
        'game_session',
        'campaign_participation',
        'redemption',
        'adjustment',
      ],
      required: true,
    },
    ref: { type: String, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

pointsEntrySchema.index({ user: 1, createdAt: -1 });

export const PointsEntry = model('PointsEntry', pointsEntrySchema);

const rewardSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    costPoints: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: -1 },
    premiumOnly: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Reward = model('Reward', rewardSchema);

const redemptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reward: { type: Schema.Types.ObjectId, ref: 'Reward', required: true },
    costPoints: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'fulfilled', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
);

export const Redemption = model('Redemption', redemptionSchema);
