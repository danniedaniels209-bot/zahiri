import { Schema, model } from 'mongoose';

/** The single record produced by the verification engine, whatever the entry point. */
const verificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    /** Where the claim entered the system. */
    entryPoint: {
      type: String,
      enum: ['app_chat', 'whatsapp', 'facebook', 'linkedin', 'hub', 'api', 'crisis_desk'],
      default: 'app_chat',
      index: true,
    },
    inputType: {
      type: String,
      enum: ['text', 'link', 'image', 'video', 'audio'],
      required: true,
      index: true,
    },
    claim: { type: String, default: '' },
    sourceUrl: { type: String, default: null },
    mediaRef: { type: String, default: null },

    verdict: {
      type: String,
      enum: ['verified', 'false', 'misleading', 'unverified', 'pending'],
      default: 'pending',
      index: true,
    },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    explanation: { type: String, default: '' },
    evidence: {
      type: [{ title: String, url: String, publisher: String, note: String }],
      default: [],
    },

    /** Which engine components contributed. */
    signals: {
      deepfake: {
        checked: { type: Boolean, default: false },
        score: { type: Number, default: null },
        indicators: { type: [String], default: [] },
      },
      provenance: {
        checked: { type: Boolean, default: false },
        hasCredentials: { type: Boolean, default: false },
        issuer: { type: String, default: null },
      },
      sourceReputation: {
        checked: { type: Boolean, default: false },
        domain: { type: String, default: null },
        score: { type: Number, default: null },
      },
    },

    humanReview: {
      required: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ['not_needed', 'queued', 'in_review', 'complete'],
        default: 'not_needed',
        index: true,
      },
      reviewer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      notes: { type: String, default: '' },
      decidedAt: { type: Date, default: null },
    },

    aiProvider: { type: String, default: null },
    aiModel: { type: String, default: null },
    latencyMs: { type: Number, default: 0 },
    language: { type: String, default: 'en' },
    publishedToHub: { type: Boolean, default: false },
  },
  { timestamps: true },
);

verificationSchema.index({ createdAt: -1 });
verificationSchema.index({ claim: 'text', explanation: 'text' });

export const Verification = model('Verification', verificationSchema);
