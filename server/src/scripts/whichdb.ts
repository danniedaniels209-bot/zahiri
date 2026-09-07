/**
 * Reports which database the current MONGODB_URI actually resolves to, and what
 * is in it.
 *
 * A `mongodb+srv://` string with no database name in the path silently connects
 * to `test`, so the app works, reports "connected", and sees none of the seeded
 * data. This makes that mistake visible.
 */
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../db/mongo.js';

const EXPECTED = 'zahiri';

async function main() {
  await connectMongo();

  const db = mongoose.connection.db;
  if (!db) {
    console.error('No database handle');
    await disconnectMongo();
    process.exit(1);
  }

  console.log(`\ndatabase name : ${db.databaseName}`);
  console.log(`host          : ${mongoose.connection.host}`);

  if (db.databaseName !== EXPECTED) {
    console.log(
      `\nWARNING: expected "${EXPECTED}" but connected to "${db.databaseName}".` +
        `\nThe database name goes in the URI path, before the "?":` +
        `\n  mongodb+srv://user:pass@cluster.mongodb.net/${EXPECTED}?retryWrites=true&w=majority`,
    );
  }

  console.log('\ncollections:');
  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  if (names.length === 0) {
    console.log('  (empty — nothing has been written to this database)');
  }
  for (const name of names) {
    const count = await db.collection(name).countDocuments();
    console.log(`  ${name.padEnd(22)} ${String(count).padStart(5)}`);
  }

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => null);
  process.exit(1);
});
