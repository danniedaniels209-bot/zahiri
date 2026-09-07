import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { GameRound, GameSession } from '../models/GameRound.js';
import { User } from '../models/User.js';
import { award } from '../utils/points.js';

const router = Router();

const CURRENT_SEASON = 'season-1';

/** Points per correct answer, before the speed bonus. */
const BASE_POINTS = { easy: 10, medium: 20, hard: 35 } as const;
/** Answering inside this many ms earns the full speed bonus. */
const FAST_ANSWER_MS = 4000;
const MAX_SPEED_BONUS = 10;

function scoreAnswer(difficulty: keyof typeof BASE_POINTS, correct: boolean, msTaken: number) {
  if (!correct) return 0;
  const base = BASE_POINTS[difficulty] ?? BASE_POINTS.medium;
  const speedRatio = Math.max(0, 1 - msTaken / (FAST_ANSWER_MS * 3));
  return base + Math.round(MAX_SPEED_BONUS * speedRatio);
}

/** Deal a set of rounds for a new game. The answer is never sent to the client. */
router.get(
  '/rounds',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = z
      .object({
        count: z.coerce.number().min(1).max(20).default(7),
        difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
        topic: z.string().optional(),
      })
      .parse(req.query);

    const match: Record<string, unknown> = { active: true, season: CURRENT_SEASON };
    if (query.difficulty) match.difficulty = query.difficulty;
    if (query.topic) match.topic = query.topic;

    const rounds = await GameRound.aggregate([
      { $match: match },
      { $sample: { size: query.count } },
      {
        $project: {
          claim: 1,
          context: 1,
          mediaRef: 1,
          difficulty: 1,
          topic: 1,
          // answer and explanation are withheld until the session is submitted
        },
      },
    ]);

    if (rounds.length === 0) {
      throw new HttpError(503, 'No game rounds are available yet. Check back shortly.');
    }

    res.json({ season: CURRENT_SEASON, count: rounds.length, rounds });
  }),
);

/** Submit a finished run. The server scores it; the client never decides points. */
router.post(
  '/sessions',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        mode: z.enum(['solo', 'battle_royale', 'daily']).default('solo'),
        answers: z
          .array(
            z.object({
              roundId: z.string(),
              answer: z.enum(['verified', 'false', 'misleading']),
              msTaken: z.number().min(0).max(120_000),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(req.body);

    const rounds = await GameRound.find({
      _id: { $in: body.answers.map((a) => a.roundId) },
    }).lean();

    const byId = new Map(rounds.map((r) => [r._id.toString(), r]));

    let score = 0;
    let correctCount = 0;
    const detail = [];
    const results = [];

    for (const a of body.answers) {
      const round = byId.get(a.roundId);
      if (!round) continue;

      const correct = round.answer === a.answer;
      const earned = scoreAnswer(round.difficulty as keyof typeof BASE_POINTS, correct, a.msTaken);
      score += earned;
      if (correct) correctCount += 1;

      detail.push({ round: round._id, answer: a.answer, correct, msTaken: a.msTaken });
      results.push({
        roundId: a.roundId,
        claim: round.claim,
        yourAnswer: a.answer,
        correctAnswer: round.answer,
        correct,
        pointsEarned: earned,
        explanation: round.explanation,
      });

      await GameRound.updateOne(
        { _id: round._id },
        { $inc: { timesPlayed: 1, timesCorrect: correct ? 1 : 0 } },
      );
    }

    const session = await GameSession.create({
      player: req.userId,
      mode: body.mode,
      season: CURRENT_SEASON,
      rounds: detail,
      score,
      correctCount,
      finishedAt: new Date(),
    });

    await award(req.userId!, 'game_session', score, session.id, `${body.mode} run`);

    res.status(201).json({
      sessionId: session.id,
      score,
      correctCount,
      total: body.answers.length,
      accuracy: Math.round((correctCount / body.answers.length) * 100),
      results,
    });
  }),
);

/** Seasonal leaderboard, aggregated from sessions rather than a cached column. */
router.get(
  '/leaderboard',
  asyncRoute(async (req, res) => {
    const query = z
      .object({
        season: z.string().default(CURRENT_SEASON),
        limit: z.coerce.number().min(1).max(100).default(25),
      })
      .parse(req.query);

    const board = await GameSession.aggregate([
      { $match: { season: query.season, finishedAt: { $ne: null } } },
      {
        $group: {
          _id: '$player',
          totalScore: { $sum: '$score' },
          sessions: { $sum: 1 },
          bestScore: { $max: '$score' },
          correct: { $sum: '$correctCount' },
        },
      },
      { $sort: { totalScore: -1 } },
      { $limit: query.limit },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'player',
        },
      },
      { $unwind: '$player' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$player.name',
          role: '$player.role',
          totalScore: 1,
          bestScore: 1,
          sessions: 1,
          correct: 1,
        },
      },
    ]);

    res.json({
      season: query.season,
      entries: board.map((e, i) => ({ rank: i + 1, ...e })),
    });
  }),
);

/** Where the signed-in player currently stands. */
router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const board = await GameSession.aggregate<{
      _id: unknown;
      totalScore: number;
      sessions: number;
    }>([
      { $match: { season: CURRENT_SEASON, finishedAt: { $ne: null } } },
      { $group: { _id: '$player', totalScore: { $sum: '$score' }, sessions: { $sum: 1 } } },
      { $sort: { totalScore: -1 } },
    ]);

    const index = board.findIndex((e) => String(e._id) === req.userId);
    const entry = index >= 0 ? board[index] : null;
    const user = await User.findById(req.userId).select('points name').lean();

    res.json({
      season: CURRENT_SEASON,
      rank: index >= 0 ? index + 1 : null,
      totalScore: entry?.totalScore ?? 0,
      sessions: entry?.sessions ?? 0,
      playersInSeason: board.length,
      lifetimePoints: user?.points ?? 0,
    });
  }),
);

export default router;
