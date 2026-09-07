import { Schema, model } from 'mongoose';

/** Misinformation-Free Community: nothing goes live until it is vetted. */
const hubPostSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, maxlength: 5000 },
    topic: { type: String, default: 'general', index: true },
    mediaRef: { type: String, default: null },
    verification: { type: Schema.Types.ObjectId, ref: 'Verification', default: null },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    moderator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    moderationNote: { type: String, default: '' },
    likes: { type: Number, default: 0 },
    likedBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    downloads: { type: Number, default: 0 },
    isResource: { type: Boolean, default: false },
  },
  { timestamps: true },
);

hubPostSchema.index({ status: 1, createdAt: -1 });

export const HubPost = model('HubPost', hubPostSchema);
