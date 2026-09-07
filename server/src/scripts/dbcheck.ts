/**
 * MongoDB Atlas connectivity and integrity check.
 *
 * Exercises the real cluster: connection, server info, every collection's count,
 * a round-trip write/read/delete, index presence, and a latency sample.
 * Run with: npm run dbcheck
 */
import mongoose, { type Model } from 'mongoose';
import { connectMongo, disconnectMongo, mongoState } from '../db/mongo.js';
import { User } from '../models/User.js';
import { Verification } from '../models/Verification.js';
import { HubPost } from '../models/HubPost.js';
import { GameRound, GameSession } from '../models/GameRound.js';
import { Alert } from '../models/Alert.js';
import { SourceReputation } from '../models/SourceReputation.js';
import { Campaign, TrainingModule } from '../models/Campaign.js';
import { PointsEntry, Reward, Redemption } from '../models/Reward.js';
import { RadioPartner } from '../models/RadioPartner.js';
import { ApiClient } from '../models/ApiClient.js';

/**
 * Typed loosely on purpose: the union of fourteen distinct mongoose document
 * types is too complex for the compiler to represent, and this map only ever
 * needs countDocuments and collection metadata.
 */
const MODELS: Record<string, Model<any>> = {
  users: User,
  verifications: Verification,
  hubposts: HubPost,
  gamerounds: GameRound,
  gamesessions: GameSession,
  alerts: Alert,
  sourcereputations: SourceReputation,
  campaigns: Campaign,
  trainingmodules: TrainingModule,
  pointsentries: PointsEntry,
  rewards: Reward,
  redemptions: Redemption,
  radiopartners: RadioPartner,
  apiclients: ApiClient,
};

const pass = (m: string) => console.log(`  PASS  ${m}`);
const fail = (m: string) => {
  console.log(`  FAIL  ${m}`);
  failures += 1;
};

let failures = 0;

async function main() {
  console.log('\nZahiri — MongoDB Atlas check\n' + '='.repeat(46));

  // 1. Connection -----------------------------------------------------------
  const t0 = Date.now();
  await connectMongo();
  const connectMs = Date.now() - t0;

  console.log('\n[1] Connection');
  mongoState() === 'connected'
    ? pass(`connected in ${connectMs}ms`)
    : fail(`state is "${mongoState()}"`);

  const db = mongoose.connection.db;
  if (!db) {
    fail('no database handle');
    await disconnectMongo();
    process.exit(1);
  }

  pass(`database: ${db.databaseName}`);
  pass(`host: ${mongoose.connection.host}`);

  // 2. Server ---------------------------------------------------------------
  console.log('\n[2] Server');
  try {
    const info = (await db.admin().command({ buildInfo: 1 })) as { version?: string };
    pass(`MongoDB version ${info.version ?? 'unknown'}`);
  } catch (err) {
    // Atlas shared tiers restrict admin commands; not a failure.
    console.log(`  SKIP  buildInfo not permitted (${(err as Error).message.slice(0, 60)})`);
  }

  const pingStart = Date.now();
  await db.command({ ping: 1 });
  const pingMs = Date.now() - pingStart;
  pingMs < 2000 ? pass(`ping ${pingMs}ms`) : fail(`ping slow: ${pingMs}ms`);

  // 3. Collections ----------------------------------------------------------
  console.log('\n[3] Collections');
  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  pass(`${existing.length} collections present`);

  let totalDocs = 0;
  for (const [name, model] of Object.entries(MODELS)) {
    const count = await model.countDocuments();
    totalDocs += count;
    console.log(`        ${name.padEnd(20)} ${String(count).padStart(5)}`);
  }
  pass(`${totalDocs} documents total`);

  // 4. Seed data ------------------------------------------------------------
  console.log('\n[4] Seed data');
  const checks: [string, number, number][] = [
    ['game rounds', await GameRound.countDocuments({ active: true }), 10],
    ['rewards', await Reward.countDocuments({ active: true }), 5],
    ['training modules', await TrainingModule.countDocuments(), 4],
    ['radio partners', await RadioPartner.countDocuments(), 4],
    ['source reputations', await SourceReputation.countDocuments(), 11],
    ['alerts', await Alert.countDocuments({ active: true }), 4],
  ];
  for (const [label, actual, expected] of checks) {
    actual >= expected
      ? pass(`${label}: ${actual}`)
      : fail(`${label}: expected >= ${expected}, got ${actual}`);
  }

  // 5. Write / read / delete round trip -------------------------------------
  console.log('\n[5] Write round trip');
  const probeDomain = `dbcheck-${Date.now()}.invalid`;
  try {
    const created = await SourceReputation.create({
      domain: probeDomain,
      displayName: 'db check probe',
      score: 42,
    });
    pass(`insert ok (${created.id})`);

    const readBack = await SourceReputation.findOne({ domain: probeDomain }).lean();
    readBack?.score === 42 ? pass('read back matches') : fail('read back mismatch');

    await SourceReputation.updateOne({ domain: probeDomain }, { $set: { score: 77 } });
    const updated = await SourceReputation.findOne({ domain: probeDomain }).lean();
    updated?.score === 77 ? pass('update ok') : fail('update did not apply');

    const del = await SourceReputation.deleteOne({ domain: probeDomain });
    del.deletedCount === 1 ? pass('delete ok') : fail('delete removed nothing');
  } catch (err) {
    fail(`round trip threw: ${(err as Error).message}`);
    await SourceReputation.deleteOne({ domain: probeDomain }).catch(() => null);
  }

  // 6. Indexes --------------------------------------------------------------
  console.log('\n[6] Indexes');
  for (const [name, model] of Object.entries(MODELS)) {
    if (!existing.includes(model.collection.name)) continue;
    try {
      const idx = await model.collection.indexes();
      idx.length > 1
        ? pass(`${name}: ${idx.length} indexes`)
        : console.log(`  NOTE  ${name}: only _id (no writes yet)`);
    } catch {
      fail(`${name}: could not list indexes`);
    }
  }

  const userIdx = await User.collection.indexes();
  userIdx.some((i) => i.unique && i.key.email)
    ? pass('users.email unique index present')
    : fail('users.email unique index MISSING');

  // 7. Constraint enforcement ----------------------------------------------
  console.log('\n[7] Constraints');
  const demo = await User.findOne({ email: 'demo@zahiri.app' }).lean();
  if (!demo) {
    fail('demo user missing — run npm run seed');
  } else {
    pass('demo user present');
    try {
      await User.create({ name: 'Dup', email: 'demo@zahiri.app', passwordHash: 'x' });
      fail('duplicate email was ACCEPTED (unique index not enforced)');
      await User.deleteOne({ name: 'Dup' });
    } catch {
      pass('duplicate email correctly rejected');
    }
  }

  // 8. Persistence of live traffic -----------------------------------------
  console.log('\n[8] Verification persistence');
  const verifications = await Verification.countDocuments();
  if (verifications > 0) {
    pass(`${verifications} verifications stored`);
    const latest = await Verification.findOne().sort({ createdAt: -1 }).lean();
    console.log(
      `        latest: "${(latest?.claim ?? '').slice(0, 50)}..." -> ${latest?.verdict} (${latest?.aiProvider})`,
    );
  } else {
    console.log('  NOTE  no verifications yet (none run against this database)');
  }

  // 9. Query performance ----------------------------------------------------
  console.log('\n[9] Query latency');
  const qStart = Date.now();
  await Promise.all([
    GameRound.aggregate([{ $match: { active: true } }, { $sample: { size: 7 } }]),
    Alert.find({ active: true }).sort({ publishedAt: -1 }).limit(20).lean(),
    User.find({ points: { $gt: 0 } }).sort({ points: -1 }).limit(25).lean(),
  ]);
  const qMs = Date.now() - qStart;
  qMs < 3000 ? pass(`3 real app queries in ${qMs}ms`) : fail(`queries slow: ${qMs}ms`);

  // Result ------------------------------------------------------------------
  console.log('\n' + '='.repeat(46));
  console.log(failures === 0 ? 'RESULT: all checks passed' : `RESULT: ${failures} check(s) FAILED`);

  await disconnectMongo();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nFATAL:', err);
  await disconnectMongo().catch(() => null);
  process.exit(1);
});
