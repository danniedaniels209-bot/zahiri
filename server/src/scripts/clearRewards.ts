/**
 * Removes the seeded reward catalogue.
 *
 * The seed shipped data bundles, a naira payout and a physical ambassador kit.
 * None of those can actually be fulfilled, and an app whose entire purpose is
 * verified information should not be the thing making unkeepable promises. The
 * points ledger stays: points still drive the leaderboard and the game.
 *
 *   npm run rewards:clear
 */
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { Reward, Redemption } from '../models/Reward.js';

async function main() {
  await connectMongo();

  const existing = await Reward.find().lean();
  if (existing.length === 0) {
    console.log('Catalogue is already empty.');
  } else {
    console.log('Removing:');
    for (const r of existing) {
      console.log(`  ${r.title} (${r.costPoints} pts)`);
    }
  }

  const rewards = await Reward.deleteMany({});
  // Redemptions only reference rewards that no longer exist, so they go too.
  const redemptions = await Redemption.deleteMany({});

  console.log(
    `\nDeleted ${rewards.deletedCount} reward(s) and ${redemptions.deletedCount} redemption(s).`,
  );
  console.log('Points and the ledger are untouched: the leaderboard still works.');

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => null);
  process.exit(1);
});
