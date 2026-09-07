import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { HubPost } from '../models/HubPost.js';
import { verifyClaim } from '../services/verify/engine.js';
import { award } from '../utils/points.js';

const router = Router();

/**
 * Community Verification Hub. Nothing is visible until it has passed the
 * verification engine and, where needed, a human moderator.
 */
router.get(
  '/posts',
  asyncRoute(async (req, res) => {
    const query = z
      .object({
        topic: z.string().optional(),
        resourcesOnly: z.coerce.boolean().default(false),
        limit: z.coerce.number().min(1).max(50).default(20),
        skip: z.coerce.number().min(0).default(0),
      })
      .parse(req.query);

    const filter: Record<string, unknown> = { status: 'approved' };
    if (query.topic) filter.topic = query.topic;
    if (query.resourcesOnly) filter.isResource = true;

    const [items, total] = await Promise.all([
      HubPost.find(filter)
        .sort({ createdAt: -1 })
        .skip(query.skip)
        .limit(query.limit)
        .populate('author', 'name role tier')
        .populate('verification', 'verdict confidence explanation signals')
        .lean(),
      HubPost.countDocuments(filter),
    ]);

    res.json({ total, count: items.length, items });
  }),
);

router.get(
  '/posts/:id',
  optionalAuth,
  asyncRoute(async (req, res) => {
    const post = await HubPost.findById(req.params.id)
      .populate('author', 'name role tier')
      .populate('verification')
      .lean();
    if (!post || post.status !== 'approved') throw new HttpError(404, 'Post not found');
    res.json(post);
  }),
);

/**
 * Submitting a post runs it through the verification engine first. A claim the
 * engine marks false is rejected outright; anything uncertain is queued for a
 * human moderator. Only a clean pass goes live immediately.
 */
router.post(
  '/posts',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        title: z.string().min(5).max(160),
        body: z.string().min(20).max(5000),
        topic: z.string().default('general'),
        isResource: z.boolean().default(false),
        mediaRef: z.string().nullable().default(null),
        language: z.string().default('en'),
      })
      .parse(req.body);

    const verification = await verifyClaim(`${body.title}\n\n${body.body}`, {
      userId: req.userId ?? null,
      language: body.language,
      entryPoint: 'hub',
    });

    const status =
      verification.verdict === 'false'
        ? 'rejected'
        : verification.verdict === 'verified' && !verification.humanReview.required
          ? 'approved'
          : 'pending';

    const post = await HubPost.create({
      author: req.userId,
      title: body.title,
      body: body.body,
      topic: body.topic,
      isResource: body.isResource,
      mediaRef: body.mediaRef,
      verification: verification.id,
      status,
      moderationNote:
        status === 'rejected'
          ? 'The verification engine judged this claim false.'
          : status === 'pending'
            ? 'Queued for a human fact-checker.'
            : '',
    });

    if (status === 'approved' && req.userId) {
      await award(req.userId, 'hub_post_approved', undefined, post.id);
    }

    res.status(201).json({
      post,
      verification,
      message:
        status === 'approved'
          ? 'Your post passed verification and is live.'
          : status === 'pending'
            ? 'Your post is with a human fact-checker. You will be notified when it is reviewed.'
            : 'This post was not published because the claim did not check out.',
    });
  }),
);

router.post(
  '/posts/:id/like',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const post = await HubPost.findOne({ _id: req.params.id, status: 'approved' });
    if (!post) throw new HttpError(404, 'Post not found');

    const already = post.likedBy.some((id) => id.toString() === req.userId);
    if (already) {
      post.likedBy = post.likedBy.filter((id) => id.toString() !== req.userId);
      post.likes = Math.max(0, post.likes - 1);
    } else {
      post.likedBy.push(req.userId as never);
      post.likes += 1;
      // Premium contributors earn on engagement with their resources.
      if (post.isResource) await award(post.author.toString(), 'resource_liked', undefined, post.id);
    }
    await post.save();

    res.json({ likes: post.likes, liked: !already });
  }),
);

router.post(
  '/posts/:id/download',
  requireAuth,
  asyncRoute(async (req, res) => {
    const post = await HubPost.findOneAndUpdate(
      { _id: req.params.id, status: 'approved', isResource: true },
      { $inc: { downloads: 1 } },
      { new: true },
    );
    if (!post) throw new HttpError(404, 'Resource not found');

    await award(post.author.toString(), 'resource_downloaded', undefined, post.id);
    res.json({ downloads: post.downloads, mediaRef: post.mediaRef });
  }),
);

/** Moderation queue for fact-checkers and admins. */
router.get(
  '/moderation/queue',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (_req, res) => {
    const items = await HubPost.find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(50)
      .populate('author', 'name role')
      .populate('verification')
      .lean();
    res.json({ count: items.length, items });
  }),
);

router.post(
  '/moderation/:id',
  requireAuth,
  requireRole('factchecker', 'admin'),
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        note: z.string().max(1000).default(''),
      })
      .parse(req.body);

    const post = await HubPost.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: body.decision,
          moderator: req.userId,
          moderationNote: body.note,
        },
      },
      { new: true },
    );
    if (!post) throw new HttpError(404, 'Post not found');

    if (body.decision === 'approved') {
      await award(post.author.toString(), 'hub_post_approved', undefined, post.id);
    }

    res.json({ post });
  }),
);

export default router;
