import { Schema, model } from 'mongoose';

/** Accessibility & reach: radio partnerships for low-connectivity communities. */
const radioPartnerSchema = new Schema(
  {
    station: { type: String, required: true },
    frequency: { type: String, default: '' },
    state: { type: String, default: '' },
    languages: { type: [String], default: ['en'] },
    slots: { type: [{ day: String, time: String, programme: String }], default: [] },
    contact: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const RadioPartner = model('RadioPartner', radioPartnerSchema);
