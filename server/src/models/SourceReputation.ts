import { Schema, model } from 'mongoose';

/** Content-Farm & Source Reputation Score. */
const sourceReputationSchema = new Schema(
  {
    domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, default: '' },
    score: { type: Number, min: 0, max: 100, default: 50, index: true },
    band: {
      type: String,
      enum: ['trusted', 'mixed', 'low', 'content_farm'],
      default: 'mixed',
      index: true,
    },
    isWatchlisted: { type: Boolean, default: false, index: true },
    aiContentFarm: { type: Boolean, default: false },
    checksTotal: { type: Number, default: 0 },
    checksFalse: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    lastEvaluatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const SourceReputation = model('SourceReputation', sourceReputationSchema);
