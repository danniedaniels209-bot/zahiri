import { Schema, model } from 'mongoose';

/** Newsroom & NGO API / B2B tier: hashed API keys with a monthly quota. */
const apiClientSchema = new Schema(
  {
    orgName: { type: String, required: true },
    contactEmail: { type: String, required: true, lowercase: true },
    keyPrefix: { type: String, required: true, index: true },
    keyHash: { type: String, required: true, select: false },
    plan: { type: String, enum: ['trial', 'newsroom', 'ngo', 'enterprise'], default: 'trial' },
    monthlyQuota: { type: Number, default: 500 },
    usedThisMonth: { type: Number, default: 0 },
    quotaResetAt: { type: Date, default: () => new Date() },
    scopes: { type: [String], default: ['verify:text', 'verify:link'] },
    active: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const ApiClient = model('ApiClient', apiClientSchema);
