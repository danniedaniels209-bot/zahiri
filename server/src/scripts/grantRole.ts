/**
 * Grant a privileged role to an existing account.
 *
 * Privileged roles are never self-assignable at sign-up, so this is the only way
 * to create the first admin or fact-checker.
 *
 *   npm run grant -- admin someone@example.com
 *   npm run grant -- factchecker desk@newsroom.ng
 */
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { User } from '../models/User.js';

const ROLES = ['user', 'ambassador', 'journalist', 'factchecker', 'org', 'admin'];

async function main() {
  const [role, email] = process.argv.slice(2);

  if (!role || !email) {
    console.error('Usage: npm run grant -- <role> <email>');
    console.error(`Roles: ${ROLES.join(', ')}`);
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`Unknown role "${role}". Roles: ${ROLES.join(', ')}`);
    process.exit(1);
  }

  await connectMongo();

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { role } },
    { new: true },
  ).lean();

  if (!user) {
    console.error(`No account found for ${email}`);
    await disconnectMongo();
    process.exit(1);
  }

  console.log(`${user.name} <${user.email}> is now: ${user.role}`);
  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => null);
  process.exit(1);
});
