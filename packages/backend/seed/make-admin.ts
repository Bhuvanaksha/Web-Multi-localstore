/**
 * Promotes an existing user to the `admin` role so they can access the
 * admin panel (/admin) and download reports.
 *
 * Usage:
 *   npm run make:admin -- email=you@example.com
 *
 * The account must already exist (register first). Re-running is safe.
 */
import { closeMongo, connectMongo } from '../src/config/db.js';
import { UserModel } from '../src/models/UserModel.js';
import { logger } from '../src/utils/logger.js';

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('email=')) ?? process.argv[2];
  const email = (arg?.split('=')[1] ?? '').trim().toLowerCase();
  if (!email.includes('@')) {
    logger.error('Usage: npm run make:admin -- email=you@example.com');
    process.exit(1);
  }

  await connectMongo();

  const user = await UserModel.findOne({ email });
  if (!user) {
    logger.error('No user found with that email — register the account first.', { email });
    await closeMongo();
    process.exit(1);
  }

  user.role = 'admin';
  user.emailVerified = true;
  await user.save();
  logger.info('User promoted to admin — log in and visit /admin', {
    email: user.email,
    id: user._id.toString(),
  });

  await closeMongo();
  process.exit(0);
}

main().catch(async (err: unknown) => {
  logger.error('make:admin failed', { error: err instanceof Error ? err.message : err });
  await closeMongo().catch(() => undefined);
  process.exit(1);
});
