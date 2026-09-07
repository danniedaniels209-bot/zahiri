/**
 * Seeds only content Zahiri can stand behind: game rounds, training modules,
 * a starter source reputation list, and a few alerts.
 *
 * Deliberately not seeded: rewards, radio partnerships and school campaigns.
 * Each of those named real organisations or promised real value that does not
 * exist. They are created through /api/admin/* by someone who knows the
 * arrangement is real.
 *
 * Safe to re-run: everything is upserted on a natural key.
 */
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { GameRound } from '../models/GameRound.js';
import { TrainingModule } from '../models/Campaign.js';
import { SourceReputation } from '../models/SourceReputation.js';
import { Alert } from '../models/Alert.js';
import { User, hashPassword } from '../models/User.js';

const GAME_ROUNDS = [
  {
    claim: 'Drinking warm salt water cures malaria within 24 hours.',
    answer: 'false',
    difficulty: 'easy',
    topic: 'health',
    explanation:
      'Malaria is treated with artemisinin-based combination therapy. Salt water does nothing to the parasite, and heavy salt intake is dangerous. NAFDAC and the WHO have both warned against this claim.',
  },
  {
    claim: 'JAMB has extended the UTME registration deadline by two weeks.',
    answer: 'misleading',
    difficulty: 'medium',
    topic: 'education',
    explanation:
      'Deadline extensions do happen, but they are only real when announced on JAMB’s official channels. Screenshots of extensions circulate every year, usually recycled from a previous season.',
  },
  {
    claim: 'A video shows a governor admitting to rigging an election.',
    answer: 'false',
    difficulty: 'hard',
    topic: 'election',
    explanation:
      'Videos like this are usually voice-cloned deepfakes or genuine footage with a fabricated audio track. Check whether the lip movements match, and look for the same clip on a verified news outlet.',
  },
  {
    claim: 'The Central Bank has announced a new naira redesign taking effect next month.',
    answer: 'misleading',
    difficulty: 'medium',
    topic: 'civic',
    explanation:
      'Currency changes are always published on the CBN’s official site and carried by major outlets simultaneously. A claim appearing only on social media or one unknown blog is not evidence.',
  },
  {
    claim: 'Nigeria’s NCDC confirmed a new outbreak and advised avoiding public transport.',
    answer: 'unverified',
    difficulty: 'hard',
    topic: 'health',
    explanation:
      'Outbreak advisories come through NCDC’s verified channels. If it is not there, treat it as unverified rather than false — it may simply be premature.',
  },
  {
    claim: 'Photographs of a bridge collapse are from an incident that happened this week.',
    answer: 'misleading',
    difficulty: 'easy',
    topic: 'local',
    explanation:
      'Old disaster photos are recycled constantly. A reverse image search usually finds the original, often years old and from a different country.',
  },
  {
    claim: 'WAEC results for this year have been released and can be checked online.',
    answer: 'verified',
    difficulty: 'easy',
    topic: 'education',
    explanation:
      'WAEC does publish results online each year through its official results portal. Verify the date against WAEC’s own announcement, and never pay a third-party site to check.',
  },
  {
    claim: 'A voice note from a "doctor" warns that a common vaccine causes infertility.',
    answer: 'false',
    difficulty: 'medium',
    topic: 'health',
    explanation:
      'This claim has circulated for years and has been repeatedly disproven. Anonymous voice notes carry no medical authority, and voice cloning now makes them trivial to fake.',
  },
  {
    claim: 'An image shows a politician at an event, but the hands have six fingers.',
    answer: 'false',
    difficulty: 'easy',
    topic: 'election',
    explanation:
      'Extra or malformed fingers are a classic sign of AI image generation. Also check teeth, ears, jewellery, and any text in the background.',
  },
  {
    claim: 'A news site with no about page and 40 articles published in one hour reports a coup.',
    answer: 'false',
    difficulty: 'medium',
    topic: 'civic',
    explanation:
      'That publishing rate is the signature of an AI content farm. Real newsrooms have bylines, an about page, and a correction policy.',
  },
];

/**
 * No reward catalogue is seeded.
 *
 * The original seed offered data bundles, a naira payout and a physical kit.
 * Nothing in Zahiri can fulfil any of those, and an app built on verified
 * information should not be the one making promises it cannot keep. Points
 * still accrue and still drive the leaderboard; add rewards here only once
 * there is a real fulfilment process behind them.
 */


const MODULES = [
  {
    slug: 'spotting-fake-news',
    title: 'Spotting Fake News',
    summary: 'The five checks that catch most false stories before you share them.',
    level: 'intro',
    durationMins: 20,
    tags: ['basics', 'schools'],
    content:
      'Check the source. Check the date. Check whether anyone else is reporting it. Check the images with a reverse search. Check whether it is asking you to feel something before it asks you to think.',
  },
  {
    slug: 'deepfake-literacy',
    title: 'Deepfake Literacy',
    summary: 'How AI-generated video, images, and voice notes give themselves away.',
    level: 'core',
    durationMins: 30,
    tags: ['deepfake', 'media', 'schools'],
    content:
      'Look at hands, teeth, ears, and jewellery in images. In video, watch the edge of the face for flicker and check lip-sync. In voice notes, listen for flat emotion, missing breaths, and background noise that never changes.',
  },
  {
    slug: 'source-checking',
    title: 'Checking a Source',
    summary: 'Telling a real newsroom from an AI content farm.',
    level: 'core',
    durationMins: 25,
    tags: ['sources', 'content-farm'],
    content:
      'A real outlet has named journalists, an about page, a contact address, and a corrections policy. A content farm has none of these, publishes at an impossible rate, and recycles the same story under many headlines.',
  },
  {
    slug: 'election-information',
    title: 'Election Information Safety',
    summary: 'Handling political claims during a high-risk period.',
    level: 'advanced',
    durationMins: 35,
    tags: ['election', 'civic'],
    content:
      'During elections, false claims move faster than corrections. Slow down before sharing. Prefer INEC’s own channels for process claims. Treat any leaked audio or video as unverified until a newsroom confirms it.',
  },
];

/**
 * No radio partnerships are seeded.
 *
 * The original seed listed Wazobia FM, Freedom Radio, Rhythm FM and Splash FM
 * with programme slots. Those are real stations and Zahiri has no arrangement
 * with any of them, so publishing the list claimed partnerships that do not
 * exist. Add real ones through POST /api/admin/radio.
 */


const SOURCES = [
  { domain: 'ncdc.gov.ng', displayName: 'Nigeria CDC', score: 96, band: 'trusted' },
  { domain: 'inecnigeria.org', displayName: 'INEC', score: 94, band: 'trusted' },
  { domain: 'jamb.gov.ng', displayName: 'JAMB', score: 95, band: 'trusted' },
  { domain: 'cbn.gov.ng', displayName: 'Central Bank of Nigeria', score: 95, band: 'trusted' },
  { domain: 'nafdac.gov.ng', displayName: 'NAFDAC', score: 94, band: 'trusted' },
  { domain: 'who.int', displayName: 'World Health Organization', score: 96, band: 'trusted' },
  { domain: 'premiumtimesng.com', displayName: 'Premium Times', score: 86, band: 'trusted' },
  { domain: 'dubawa.org', displayName: 'Dubawa', score: 90, band: 'trusted' },
  { domain: 'africacheck.org', displayName: 'Africa Check', score: 91, band: 'trusted' },
  { domain: 'punchng.com', displayName: 'Punch', score: 80, band: 'trusted' },
  { domain: 'channelstv.com', displayName: 'Channels TV', score: 84, band: 'trusted' },
];

async function seed() {
  await connectMongo();
  console.log('[seed] connected');

  for (const r of GAME_ROUNDS) {
    await GameRound.updateOne(
      { claim: r.claim },
      { $set: { ...r, season: 'season-1', active: true } },
      { upsert: true },
    );
  }
  console.log(`[seed] ${GAME_ROUNDS.length} game rounds`);

  for (const m of MODULES) {
    await TrainingModule.updateOne({ slug: m.slug }, { $set: m }, { upsert: true });
  }
  console.log(`[seed] ${MODULES.length} training modules`);

  for (const s of SOURCES) {
    await SourceReputation.updateOne(
      { domain: s.domain },
      { $set: { ...s, lastEvaluatedAt: new Date() } },
      { upsert: true },
    );
  }
  console.log(`[seed] ${SOURCES.length} source reputations`);

  const alerts = [
    {
      title: 'No, the CBN has not announced a new naira redesign this month',
      summary:
        'A widely shared post claims a redesign takes effect next month. No such announcement exists on the CBN’s official channels.',
      topic: 'civic',
      verdict: 'false',
      correction: 'Currency changes are announced on cbn.gov.ng and carried by major outlets at the same time.',
      isCrisis: true,
      circulationScore: 84,
    },
    {
      title: 'Salt water does not cure malaria',
      summary:
        'A recurring health claim resurfaced this week. Malaria requires artemisinin-based combination therapy.',
      topic: 'health',
      verdict: 'false',
      correction: 'Visit a clinic and get tested. Salt water is not a treatment and high salt intake is harmful.',
      isCrisis: true,
      circulationScore: 71,
    },
    {
      title: 'How to check a WAEC result without being scammed',
      summary:
        'Results are checked through WAEC’s own portal with a scratch card. Third-party sites charging a fee are not official.',
      topic: 'education',
      verdict: 'verified',
    },
    {
      title: 'Deepfake voice notes are now the most common fraud pattern in group chats',
      summary:
        'Cloned voices of family members asking for urgent transfers are spreading. Always call the person back on a known number.',
      topic: 'local',
      verdict: 'verified',
    },
  ];

  for (const a of alerts) {
    await Alert.updateOne(
      { title: a.title },
      { $set: { ...a, region: 'NG', language: 'en', active: true, publishedAt: new Date() } },
      { upsert: true },
    );
  }
  console.log(`[seed] ${alerts.length} alerts`);

  const demoEmail = 'demo@zahiri.app';
  const existing = await User.findOne({ email: demoEmail }).lean();
  if (!existing) {
    await User.create({
      name: 'Demo User',
      email: demoEmail,
      passwordHash: await hashPassword('zahiri1234'),
      role: 'user',
    });
    console.log('[seed] demo account created: demo@zahiri.app / zahiri1234');
  }

  // No campaigns are seeded. The originals named Government College Ibadan and
  // Queen's College Lagos with student-reach figures that were invented. Real
  // outreach is recorded through POST /api/admin/campaigns.

  await disconnectMongo();
  console.log('[seed] done');
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
