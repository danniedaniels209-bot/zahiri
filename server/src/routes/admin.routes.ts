import { Router } from 'express';
import { z } from 'zod';
import type { Model } from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { RadioPartner } from '../models/RadioPartner.js';
import { Campaign, TrainingModule } from '../models/Campaign.js';
import { SourceReputation } from '../models/SourceReputation.js';
import { GameRound } from '../models/GameRound.js';
import { Alert } from '../models/Alert.js';
import { bandForScore } from '../services/verify/reputation.js';

/**
 * Content management for admins.
 *
 * Everything a person might otherwise be tempted to seed with invented data —
 * radio partnerships, school campaigns, the source watchlist, game rounds — is
 * editable here instead. Zahiri names real organisations in this content, so it
 * has to come from someone who actually knows the arrangement exists, not from
 * a seed file.
 *
 * Every route is admin-only. The read endpoints stay on the public routers.
 */

const router = Router();

/**
 * Every route below repeats `requireAuth, requireRole('admin')` rather than
 * using router.use, matching the pattern already used by the B2B and rewards
 * routers. It is more verbose but there is no way to reach a handler here
 * without both guards being visible on the route itself.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Deletes one document by id and 404s when it was not there, so a repeated
 * delete does not silently look successful.
 */
async function removeById(model: Model<any>, id: string, label: string) {
  const doc = await model.findByIdAndDelete(id);
  if (!doc) throw new HttpError(404, `${label} not found`);
  return doc;
}

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Not a valid id');

// ---------------------------------------------------------------------------
// Radio partners
// ---------------------------------------------------------------------------

const slotSchema = z.object({
  day: z.string().min(1),
  time: z.string().min(1),
  programme: z.string().min(1),
});

const radioSchema = z.object({
  station: z.string().min(2).max(120),
  frequency: z.string().max(40).default(''),
  state: z.string().max(80).default(''),
  languages: z.array(z.string()).default(['en']),
  slots: z.array(slotSchema).default([]),
  contact: z.string().max(200).default(''),
  active: z.boolean().default(true),
});

/** Admin listing includes inactive partners, unlike the public route. */
router.get(
  '/radio',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (_req, res) => {
    const items = await RadioPartner.find().sort({ station: 1 }).lean();
    res.json({ count: items.length, items });
  }),
);

router.post(
  '/radio',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const body = radioSchema.parse(req.body);
    res.status(201).json(await RadioPartner.create(body));
  }),
);

router.patch(
  '/radio/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const body = radioSchema.partial().parse(req.body);
    const doc = await RadioPartner.findByIdAndUpdate(id, { $set: body }, { new: true });
    if (!doc) throw new HttpError(404, 'Radio partner not found');
    res.json(doc);
  }),
);

router.delete(
  '/radio/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const doc = await removeById(RadioPartner, id, 'Radio partner');
    res.json({ deleted: true, station: doc.station });
  }),
);

// ---------------------------------------------------------------------------
// School campaigns
// ---------------------------------------------------------------------------

const campaignSchema = z.object({
  school: z.string().min(2).max(160),
  state: z.string().max(80).default(''),
  city: z.string().max(80).default(''),
  scheduledFor: z.coerce.date(),
  status: z.enum(['planned', 'confirmed', 'completed', 'cancelled']).default('planned'),
  modules: z.array(z.string()).optional(),
  studentsReached: z.number().min(0).default(0),
  teachersTrained: z.number().min(0).default(0),
  notes: z.string().max(2000).default(''),
});

router.get(
  '/campaigns',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (_req, res) => {
    const items = await Campaign.find().sort({ scheduledFor: -1 }).lean();
    res.json({ count: items.length, items });
  }),
);

router.post(
  '/campaigns',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const body = campaignSchema.parse(req.body);
    res.status(201).json(await Campaign.create(body));
  }),
);

router.patch(
  '/campaigns/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const body = campaignSchema.partial().parse(req.body);
    const doc = await Campaign.findByIdAndUpdate(id, { $set: body }, { new: true });
    if (!doc) throw new HttpError(404, 'Campaign not found');
    res.json(doc);
  }),
);

router.delete(
  '/campaigns/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const doc = await removeById(Campaign, id, 'Campaign');
    res.json({ deleted: true, school: doc.school });
  }),
);

// ---------------------------------------------------------------------------
// Training modules
// ---------------------------------------------------------------------------

const moduleSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens'),
  title: z.string().min(2).max(160),
  summary: z.string().max(400).default(''),
  level: z.enum(['intro', 'core', 'advanced']).default('intro'),
  durationMins: z.number().min(1).max(600).default(15),
  content: z.string().max(20000).default(''),
  tags: z.array(z.string()).default([]),
  signLanguageVideoUrl: z.string().nullable().default(null),
});

router.post(
  '/modules',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const body = moduleSchema.parse(req.body);
    res.status(201).json(await TrainingModule.create(body));
  }),
);

router.patch(
  '/modules/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const body = moduleSchema.partial().parse(req.body);
    const doc = await TrainingModule.findByIdAndUpdate(id, { $set: body }, { new: true });
    if (!doc) throw new HttpError(404, 'Module not found');
    res.json(doc);
  }),
);

router.delete(
  '/modules/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const doc = await removeById(TrainingModule, id, 'Module');
    res.json({ deleted: true, slug: doc.slug });
  }),
);

// ---------------------------------------------------------------------------
// Source reputation and the content-farm watchlist
// ---------------------------------------------------------------------------

const sourceSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(200)
    .transform((d) => d.trim().toLowerCase().replace(/^www\./, '')),
  displayName: z.string().max(160).default(''),
  score: z.number().min(0).max(100).default(50),
  isWatchlisted: z.boolean().default(false),
  aiContentFarm: z.boolean().default(false),
  notes: z.string().max(2000).default(''),
});

router.get(
  '/sources',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (_req, res) => {
    const items = await SourceReputation.find().sort({ score: -1 }).lean();
    res.json({ count: items.length, items });
  }),
);

/** Upsert: re-adding a domain edits it rather than failing on the unique index. */
router.post(
  '/sources',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const body = sourceSchema.parse(req.body);
    const band = bandForScore(body.score, body.aiContentFarm);

    const doc = await SourceReputation.findOneAndUpdate(
      { domain: body.domain },
      { $set: { ...body, band, lastEvaluatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.status(201).json(doc);
  }),
);

router.patch(
  '/sources/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const body = sourceSchema.partial().parse(req.body);

    const existing = await SourceReputation.findById(id);
    if (!existing) throw new HttpError(404, 'Source not found');

    // The band is derived, never set by hand, so it cannot drift from the score.
    const score = body.score ?? existing.score;
    const farm = body.aiContentFarm ?? existing.aiContentFarm;

    const doc = await SourceReputation.findByIdAndUpdate(
      id,
      { $set: { ...body, band: bandForScore(score, farm), lastEvaluatedAt: new Date() } },
      { new: true },
    );
    res.json(doc);
  }),
);

router.delete(
  '/sources/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const doc = await removeById(SourceReputation, id, 'Source');
    res.json({ deleted: true, domain: doc.domain });
  }),
);

// ---------------------------------------------------------------------------
// Truth Hunters rounds
// ---------------------------------------------------------------------------

const roundSchema = z.object({
  claim: z.string().min(10).max(400),
  context: z.string().max(1000).default(''),
  answer: z.enum(['verified', 'false', 'misleading']),
  explanation: z.string().min(10).max(2000),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  topic: z.string().max(60).default('general'),
  season: z.string().max(40).default('season-1'),
  active: z.boolean().default(true),
});

/** Admin listing includes the answer, which the gameplay route withholds. */
router.get(
  '/rounds',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (_req, res) => {
    const items = await GameRound.find().sort({ createdAt: -1 }).lean();
    res.json({ count: items.length, items });
  }),
);

router.post(
  '/rounds',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const body = roundSchema.parse(req.body);
    res.status(201).json(await GameRound.create(body));
  }),
);

router.patch(
  '/rounds/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const body = roundSchema.partial().parse(req.body);
    const doc = await GameRound.findByIdAndUpdate(id, { $set: body }, { new: true });
    if (!doc) throw new HttpError(404, 'Round not found');
    res.json(doc);
  }),
);

router.delete(
  '/rounds/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const doc = await removeById(GameRound, id, 'Round');
    res.json({ deleted: true, claim: doc.claim.slice(0, 60) });
  }),
);

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

router.delete(
  '/alerts/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const doc = await removeById(Alert, id, 'Alert');
    res.json({ deleted: true, title: doc.title });
  }),
);

// ---------------------------------------------------------------------------
// Content overview
// ---------------------------------------------------------------------------

/** What exists, so an admin can see at a glance what still needs real data. */
router.get(
  '/overview',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (_req, res) => {
    const [radio, campaigns, modules, sources, rounds, alerts] = await Promise.all([
      RadioPartner.countDocuments(),
      Campaign.countDocuments(),
      TrainingModule.countDocuments(),
      SourceReputation.countDocuments(),
      GameRound.countDocuments({ active: true }),
      Alert.countDocuments({ active: true }),
    ]);

    res.json({
      radioPartners: radio,
      campaigns,
      trainingModules: modules,
      sources,
      activeGameRounds: rounds,
      activeAlerts: alerts,
    });
  }),
);

export default router;
