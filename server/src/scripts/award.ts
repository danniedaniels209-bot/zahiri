/**
 * Manually adjust a user's points balance through the ledger.
 *
 * Writes an `adjustment` entry rather than setting the balance directly, so the
 * total always remains reconstructable from the ledger.
 *
 *   npm run award -- someone@example.com 1000 "launch bonus"
 */
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { User } from '../models/User.js';
import { award } from '../utils/points.js';

async function main() {
  const [email, amountRaw, ...noteParts] = process.argv.slice(2);
  const amount = Number(amountRaw);

  if (!email || !Number.isFinite(amount) || amount === 0) {
    console.error('Usage: npm run award -- <email> <amount> [note]');
    process.exit(1);
  }

  await connectMongo();

  const user = await User.findOne({ email: email.toLowerCase() }).select('name points').lean();
  if (!user) {
    console.error(`No account found for ${email}`);
    await disconnectMongo();
    process.exit(1);
  }

  const balance = await award(
    user._id.toString(),
    'adjustment',
    amount,
    undefined,
    noteParts.join(' ') || 'manual adjustment',
  );

  console.log(`${user.name}: ${user.points} -> ${balance} (${amount > 0 ? '+' : ''}${amount})`);
  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => null);
  process.exit(1);
});
