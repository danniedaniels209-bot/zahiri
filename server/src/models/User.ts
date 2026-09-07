import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['user', 'ambassador', 'journalist', 'factchecker', 'org', 'admin'],
      default: 'user',
      index: true,
    },
    tier: { type: String, enum: ['free', 'premium', 'b2b'], default: 'free' },
    language: { type: String, default: 'en' },
    country: { type: String, default: 'NG' },
    points: { type: Number, default: 0, min: 0, index: true },
    streakDays: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: Date.now },
    accessibility: {
      signLanguage: { type: Boolean, default: false },
      largeText: { type: Boolean, default: false },
      highContrast: { type: Boolean, default: false },
      audioReadout: { type: Boolean, default: false },
    },
    topics: { type: [String], default: ['health', 'civic', 'education'] },
    whatsappNumber: { type: String, default: null, index: true, sparse: true },
  },
  { timestamps: true },
);

userSchema.methods.checkPassword = function (plain: string) {
  return bcrypt.compare(plain, this.passwordHash);
};

export async function hashPassword(plain: string) {
  // Cost 12: meaningfully slower to brute force than the common default of 10,
  // still well under Render's request budget.
  return bcrypt.hash(plain, 12);
}

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>> & {
  checkPassword(plain: string): Promise<boolean>;
};

export const User = model('User', userSchema);
