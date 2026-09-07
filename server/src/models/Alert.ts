import { Schema, model } from 'mongoose';

/** Daily Updates & Alerts, and the Election & Crisis rapid-response feed. */
const alertSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    summary: { type: String, required: true, maxlength: 1000 },
    body: { type: String, default: '' },
    topic: {
      type: String,
      enum: ['health', 'education', 'civic', 'local', 'election', 'crisis', 'general'],
      default: 'general',
      index: true,
    },
    verdict: {
      type: String,
      enum: ['verified', 'false', 'misleading', 'unverified'],
      default: 'verified',
    },
    /** Crisis-mode entries are ranked by how widely the false claim is circulating. */
    isCrisis: { type: Boolean, default: false, index: true },
    circulationScore: { type: Number, default: 0, index: true },
    correction: { type: String, default: '' },
    region: { type: String, default: 'NG' },
    language: { type: String, default: 'en' },
    sources: { type: [{ title: String, url: String }], default: [] },
    signLanguageVideoUrl: { type: String, default: null },
    audioUrl: { type: String, default: null },
    publishedAt: { type: Date, default: Date.now, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

alertSchema.index({ isCrisis: 1, circulationScore: -1, publishedAt: -1 });

export const Alert = model('Alert', alertSchema);
