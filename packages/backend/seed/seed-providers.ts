/**
 * Seeds the provider marketplace from seed/provider-catalog.json.
 *
 * Idempotent: providers are matched by email, listings by (providerId + title),
 * so it can be re-run safely as the catalog grows. To deploy with real data,
 * replace provider-catalog.json with your own providers/listings and re-run:
 *
 *   npm run seed
 */
import type { CreateProviderListingInput } from '@alpha/shared';
import { closeMongo, connectMongo } from '../src/config/db.js';
import { ProviderListingModel } from '../src/models/ProviderListingModel.js';
import { UserModel } from '../src/models/UserModel.js';
import { logger } from '../src/utils/logger.js';
import catalog from './provider-catalog.json' with { type: 'json' };

interface CatalogListing extends CreateProviderListingInput {
  availability?: CreateProviderListingInput['availability'];
}

async function seed(): Promise<void> {
  await connectMongo();

  const currency = catalog.currency ?? 'INR';
  let users = 0;
  let listings = 0;

  for (const provider of catalog.providers) {
    // Upsert the provider account (matched by email). The catalog is the
    // source of truth: passwords are re-hashed on every run so seeded accounts
    // are deterministic (hand them over to the real providers afterwards).
    let user = await UserModel.findOne({ email: provider.email.toLowerCase() });
    if (!user) {
      user = await UserModel.create({
        email: provider.email.toLowerCase(),
        username: provider.username,
        password: provider.password,
        profile: provider.profile,
        role: 'provider',
        isActive: true,
        emailVerified: true,
      });
    } else {
      user.profile = provider.profile;
      user.password = provider.password;
      user.isActive = true;
      user.emailVerified = true;
      // Catalog accounts are sellers — migrate legacy `member` roles too.
      if (user.role !== 'admin') user.role = 'provider';
      await user.save();
    }
    users += 1;

    // Upsert each listing (matched by providerId + title).
    for (const raw of provider.listings as CatalogListing[]) {
      const exists = await ProviderListingModel.exists({
        providerId: user._id,
        title: raw.title,
      });
      if (exists) continue;

      await ProviderListingModel.create({
        providerId: user._id,
        title: raw.title,
        description: raw.description,
        category: raw.category,
        price: raw.price,
        unit: raw.unit,
        currency,
        quantity: raw.quantity,
        availability: raw.availability ?? 'available',
        contactPhone: provider.contactPhone,
        contactEmail: provider.contactEmail,
      });
      listings += 1;
    }

    logger.info('provider seeded', { username: provider.username, email: provider.email });
  }

  // Legacy `member` accounts (created before the role split) get their role
  // from the email rule: .local → admin, store/groceries → provider, else
  // customer. Customers and providers can never publish community resources.
  const roleFromEmail = (email: string): string => {
    const n = email.toLowerCase().trim();
    if (n.endsWith('.local')) return 'admin';
    if (/(store|groceries)/.test(n)) return 'provider';
    return 'customer';
  };
  const legacyMembers = await UserModel.find({ role: 'member' }).select('email');
  let migrated = 0;
  for (const u of legacyMembers) {
    const role = roleFromEmail(u.email as string);
    if (role !== 'member') {
      u.role = role as 'admin' | 'provider' | 'customer';
      await u.save();
      migrated += 1;
    }
  }
  if (migrated > 0) {
    logger.info('legacy member roles migrated', { migrated });
  }

  logger.info('seed complete', { providersSeededOrUpdated: users, listingsCreated: listings });
  await closeMongo();
  process.exit(0);
}

seed().catch(async (err: unknown) => {
  logger.error('seed failed', { error: err instanceof Error ? err.message : err });
  await closeMongo().catch(() => undefined);
  process.exit(1);
});
