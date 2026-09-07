import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { Verification } from '../models/Verification.js';
import { User } from '../models/User.js';
import { recordOutcome } from '../services/verify/reputation.js';
import { notifyVerdict } from '../services/whatsapp.js';

const router = Router();

const VERDICT_LABEL: Record<string, string> = {
  verified: 'VERIFIED',
  false: 'FALSE',
  misleading: 'MISLEADING',
  unverified: 'STILL UNVERIFIED',
};

/**
 * The human fact-checker queue.
 *
 * The engine routes anything low-confidence, election-related, health-critical,
 * or naming a private individual here. Without this route those claims sit at
 * `humanReview.status: "queued"` forever, and the user is told a person will
 * look at it when nobody can.
 */
router.get(
  '/queue',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (req, res) => {
    const query = z
      .object({
        status: z.enum(['queued', 'in_review', 'complete']).default('queued'),
        entryPoint: z
          .enum(['app_chat', 'whatsapp', 'facebook', 'linkedin', 'hub', 'api', 'crisis_desk'])
          .optional(),
        limit: z.coerce.number().min(1).max(100).default(30),
      })
      .parse(req.query);

    const filter: Record<string, unknown> = {
      'humanReview.required': true,
      'humanReview.status': query.status,
    };
    if (query.entryPoint) filter.entryPoint = query.entryPoint;

    const [items, total] = await Promise.all([
      Verification.find(filter)
        // Oldest first: someone has been waiting on these.
        .sort({ createdAt: 1 })
        .limit(query.limit)
        .populate('user', 'name email whatsappNumber')
        .populate('humanReview.reviewer', 'name')
        .lean(),
      Verification.countDocuments(filter),
    ]);

    res.json({ status: query.status, total, count: items.length, items });
  }),
);

/** Claim a verification so two fact-checkers do not duplicate the work. */
router.post(
  '/:id/claim',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (req: AuthedRequest, res) => {
    const item = await Verification.findOneAndUpdate(
      { _id: req.params.id, 'humanReview.status': 'queued' },
      { $set: { 'humanReview.status': 'in_review', 'humanReview.reviewer': req.userId } },
      { new: true },
    );

    if (!item) {
      throw new HttpError(409, 'That check is not in the queue, or someone already took it');
    }
    res.json({ verification: item });
  }),
);

/**
 * Submit the human verdict. This overrides whatever the model decided, folds the
 * outcome back into the source reputation record, and tells the user — over
 * WhatsApp when that is where the claim came from.
 */
router.post(
  '/:id/decide',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        verdict: z.enum(['verified', 'false', 'misleading', 'unverified']),
        explanation: z.string().min(10).max(2000),
        confidence: z.number().min(0).max(100).default(95),
        notes: z.string().max(2000).default(''),
        evidence: z
          .array(
            z.object({
              title: z.string().default(''),
              url: z.string().default(''),
              publisher: z.string().default(''),
              note: z.string().default(''),
            }),
          )
          .default([]),
      })
      .parse(req.body);

    const item = await Verification.findById(req.params.id);
    if (!item) throw new HttpError(404, 'Verification not found');

    // Mongoose types these nested subdocuments as optional, so narrow once here
    // rather than asserting at every use.
    const review = item.humanReview;
    if (!review) throw new HttpError(500, 'This verification has no review record');
    if (review.status === 'complete') {
      throw new HttpError(409, 'This check has already been decided');
    }

    const machineVerdict = item.verdict;

    item.verdict = body.verdict;
    item.confidence = body.confidence;
    item.explanation = body.explanation;
    if (body.evidence.length) item.evidence = body.evidence as never;

    review.status = 'complete';
    review.reviewer = req.userId as never;
    review.notes = body.notes;
    review.decidedAt = new Date();

    await item.save();

    // A human overturning the model is worth recording — it is the signal that
    // the engine's calibration is drifting.
    if (machineVerdict !== body.verdict) {
      console.log(
        JSON.stringify({
          type: 'review',
          event: 'verdict.overturned',
          verificationId: item.id,
          from: machineVerdict,
          to: body.verdict,
          model: item.aiModel,
        }),
      );
    }

    const reputationDomain = item.signals?.sourceReputation?.domain;
    if (reputationDomain) {
      await recordOutcome(reputationDomain, body.verdict);
    }

    // Tell the person who asked, on the channel they used.
    let notified = null;
    if (item.entryPoint === 'whatsapp' && item.user) {
      const owner = await User.findById(item.user).select('whatsappNumber').lean();
      if (owner?.whatsappNumber) {
        const summary = `${VERDICT_LABEL[body.verdict]} (${body.confidence}% confidence). ${body.explanation}`;
        notified = await notifyVerdict(
          owner.whatsappNumber,
          item.claim || 'the media you sent',
          summary,
        );
        if (!notified.sent) {
          console.warn(
            `[review] could not notify ${item.id} over WhatsApp: ${notified.reason ?? 'send failed'}`,
          );
        }
      }
    }

    res.json({
      verification: item,
      overturned: machineVerdict !== body.verdict,
      previousVerdict: machineVerdict,
      notified,
    });
  }),
);

/** How well the engine is tracking against human reviewers. */
router.get(
  '/stats',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (_req, res) => {
    const [queued, inReview, completed] = await Promise.all([
      Verification.countDocuments({ 'humanReview.status': 'queued' }),
      Verification.countDocuments({ 'humanReview.status': 'in_review' }),
      Verification.countDocuments({ 'humanReview.status': 'complete' }),
    ]);

    const [oldest] = await Verification.find({ 'humanReview.status': 'queued' })
      .sort({ createdAt: 1 })
      .limit(1)
      .select('createdAt')
      .lean();

    res.json({
      queued,
      inReview,
      completed,
      oldestQueuedAt: oldest?.createdAt ?? null,
      oldestWaitingHours: oldest
        ? Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 3_600_000)
        : 0,
    });
  }),
);

export default router;
