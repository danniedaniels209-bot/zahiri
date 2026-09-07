import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { optionalAuth, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { verifyLimiter } from '../middleware/rateLimit.js';
import { verifyClaim, verifyMedia } from '../services/verify/engine.js';
import { extractDomain, scoreDomain } from '../services/verify/reputation.js';
import { inspectProvenance } from '../services/verify/provenance.js';
import { Verification } from '../models/Verification.js';
import { SourceReputation } from '../models/SourceReputation.js';
import { award } from '../utils/points.js';
import {
  logSecurityEvent,
  safeFilename,
  validateUpload,
} from '../middleware/security.js';

const router = Router();

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/^(image|video|audio)\//.test(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'Only image, video, and audio files can be checked'));
  },
});

/** Text or link verification. */
router.post(
  '/claim',
  verifyLimiter,
  optionalAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        claim: z.string().min(3, 'Give Zahiri a bit more to work with').max(4000),
        language: z.string().default('en'),
        entryPoint: z
          .enum(['app_chat', 'whatsapp', 'facebook', 'linkedin', 'hub', 'api', 'crisis_desk'])
          .default('app_chat'),
      })
      .parse(req.body);

    const result = await verifyClaim(body.claim, {
      userId: req.userId ?? null,
      language: body.language,
      entryPoint: body.entryPoint,
    });

    if (req.userId) await award(req.userId, 'verification_submitted', undefined, result.id ?? undefined);

    res.json(result);
  }),
);

/** Deepfake & synthetic media detection, plus a provenance read on the same file. */
router.post(
  '/media',
  verifyLimiter,
  optionalAuth,
  upload.single('file'),
  asyncRoute(async (req: AuthedRequest, res) => {
    if (!req.file) throw new HttpError(400, 'Attach a file in the "file" field');

    const body = z
      .object({
        description: z.string().max(1000).optional(),
        language: z.string().default('en'),
        entryPoint: z
          .enum(['app_chat', 'whatsapp', 'facebook', 'linkedin', 'hub', 'api', 'crisis_desk'])
          .default('app_chat'),
      })
      .parse(req.body ?? {});

    const check = validateUpload(req.file.buffer, req.file.mimetype);
    if (!check.ok) {
      logSecurityEvent('upload.rejected', {
        reason: check.reason,
        declaredMime: req.file.mimetype,
        ip: req.ip,
      });
      throw new HttpError(400, check.reason!);
    }

    const result = await verifyMedia(req.file.buffer, req.file.mimetype, {
      description: body.description,
      filename: safeFilename(req.file.originalname),
      language: body.language,
      entryPoint: body.entryPoint,
      userId: req.userId ?? null,
    });

    if (req.userId) await award(req.userId, 'verification_submitted', undefined, result.id ?? undefined);

    res.json(result);
  }),
);

/** Provenance-only check: fast, no AI call, no rate-limit cost. */
router.post(
  '/provenance',
  optionalAuth,
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Attach a file in the "file" field');

    const check = validateUpload(req.file.buffer, req.file.mimetype);
    if (!check.ok) {
      logSecurityEvent('upload.rejected', { reason: check.reason, ip: req.ip });
      throw new HttpError(400, check.reason!);
    }

    res.json({
      filename: safeFilename(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      ...inspectProvenance(req.file.buffer),
    });
  }),
);

/** Source reputation lookup for a domain or full URL. */
router.get(
  '/source',
  asyncRoute(async (req, res) => {
    const raw = z.string().min(3).parse(req.query.url ?? req.query.domain);
    const domain = extractDomain(raw);
    if (!domain) throw new HttpError(400, 'That does not look like a valid domain or URL');
    res.json(await scoreDomain(domain));
  }),
);

/** The public AI content-farm watchlist. */
router.get(
  '/watchlist',
  asyncRoute(async (_req, res) => {
    const items = await SourceReputation.find({
      $or: [{ isWatchlisted: true }, { aiContentFarm: true }],
    })
      .sort({ score: 1 })
      .limit(200)
      .lean();
    res.json({ count: items.length, items });
  }),
);

/** The signed-in user's own verification history. */
router.get(
  '/history',
  requireAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const items = await Verification.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ count: items.length, items });
  }),
);

router.get(
  '/:id',
  optionalAuth,
  asyncRoute(async (req, res) => {
    const item = await Verification.findById(req.params.id).lean();
    if (!item) throw new HttpError(404, 'Verification not found');
    res.json(item);
  }),
);

export default router;
