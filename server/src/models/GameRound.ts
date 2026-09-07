import { Schema, model } from 'mongoose';

/** Truth Hunters: one claim card players must judge. */
const gameRoundSchema = new Schema(
  {
    claim: { type: String, required: true, maxlength: 400 },
    context: { type: String, default: '' },
    mediaRef: { type: String, default: null },
    answer: { type: String, enum: ['verified', 'false', 'misleading'], required: true },
    explanation: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    topic: { type: String, default: 'general', index: true },
    season: { type: String, default: 'season-1', index: true },
    /** Rounds can be sourced from real verifications logged by the hub. */
    sourceVerification: { type: Schema.Types.ObjectId, ref: 'Verification', default: null },
    timesPlayed: { type: Number, default: 0 },
    timesCorrect: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const GameRound = model('GameRound', gameRoundSchema);

/** One player's run through a set of rounds. */
const gameSessionSchema = new Schema(
  {
    player: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: ['solo', 'battle_royale', 'daily'], default: 'solo' },
    season: { type: String, default: 'season-1', index: true },
    rounds: {
      type: [
        {
          round: { type: Schema.Types.ObjectId, ref: 'GameRound' },
          answer: String,
          correct: Boolean,
          msTaken: Number,
        },
      ],
      default: [],
    },
    score: { type: Number, default: 0, index: true },
    correctCount: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

gameSessionSchema.index({ season: 1, score: -1 });

export const GameSession = model('GameSession', gameSessionSchema);
