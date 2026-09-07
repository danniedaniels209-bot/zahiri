import { Schema, model } from 'mongoose';

/** Youth-Led School Sensitisation Campaigns. */
const campaignSchema = new Schema(
  {
    school: { type: String, required: true },
    state: { type: String, default: '' },
    city: { type: String, default: '' },
    scheduledFor: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['planned', 'confirmed', 'completed', 'cancelled'],
      default: 'planned',
      index: true,
    },
    ambassadors: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    modules: {
      type: [String],
      default: ['spotting-fake-news', 'deepfake-literacy', 'source-checking'],
    },
    studentsReached: { type: Number, default: 0 },
    teachersTrained: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Campaign = model('Campaign', campaignSchema);

/** Training material used both in campaigns and in-app learning. */
const trainingModuleSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    level: { type: String, enum: ['intro', 'core', 'advanced'], default: 'intro' },
    durationMins: { type: Number, default: 15 },
    content: { type: String, default: '' },
    tags: { type: [String], default: [] },
    signLanguageVideoUrl: { type: String, default: null },
  },
  { timestamps: true },
);

export const TrainingModule = model('TrainingModule', trainingModuleSchema);
