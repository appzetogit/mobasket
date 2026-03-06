import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error('MONGODB_URI (or MONGO_URI) is missing.');
  process.exit(1);
}

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || '').trim());

const inferPlatform = ({ platform, name }) => {
  const normalizedPlatform = String(platform || '').toLowerCase().trim();
  if (normalizedPlatform === 'mogrocery' || normalizedPlatform === 'grocery') return 'mogrocery';
  const normalizedName = String(name || '').toLowerCase();
  if (normalizedName.includes('grocery')) return 'mogrocery';
  return 'mofood';
};

const sanitizeName = (value, fallbackId) => {
  const cleaned = String(value || '').trim();
  if (cleaned) return cleaned;
  return `Restored Restaurant ${fallbackId.slice(-6)}`;
};

const buildFallbackEmail = (id) => `restored-${id}@mobasket.local`;
const buildFallbackRestaurantId = (id) => `REST-RECOVERED-${id.slice(-10).toUpperCase()}`;

const collectReferenceMap = async (db) => {
  const refs = new Map();

  const orders = await db.collection('orders')
    .find({}, { projection: { restaurantId: 1, restaurantName: 1, restaurantPlatform: 1, platform: 1 } })
    .toArray();

  for (const order of orders) {
    const id = String(order?.restaurantId || '').trim();
    if (!isValidObjectId(id)) continue;
    if (!refs.has(id)) {
      refs.set(id, {
        name: order?.restaurantName || '',
        platform: order?.restaurantPlatform || order?.platform || ''
      });
    }
  }

  const menus = await db.collection('menus')
    .find({}, { projection: { restaurant: 1, restaurantId: 1, restaurantName: 1, platform: 1 } })
    .toArray();

  for (const menu of menus) {
    const id = String(menu?.restaurant || menu?.restaurantId || '').trim();
    if (!isValidObjectId(id)) continue;
    if (!refs.has(id)) {
      refs.set(id, {
        name: menu?.restaurantName || '',
        platform: menu?.platform || ''
      });
    }
  }

  return refs;
};

const run = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const refs = await collectReferenceMap(db);
  const ids = [...refs.keys()];

  if (ids.length === 0) {
    console.log('No referenced restaurant IDs found in orders/menus.');
    await mongoose.disconnect();
    return;
  }

  const existing = await Restaurant.find({ _id: { $in: ids } }).select('_id').lean();
  const existingSet = new Set(existing.map((doc) => String(doc._id)));

  let inserted = 0;
  let skipped = 0;

  for (const id of ids) {
    if (existingSet.has(id)) {
      skipped += 1;
      continue;
    }

    const ref = refs.get(id) || {};
    const name = sanitizeName(ref.name, id);
    const platform = inferPlatform({ platform: ref.platform, name });
    const email = buildFallbackEmail(id);

    await Restaurant.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      {
        $setOnInsert: {
          name,
          ownerName: 'Restored Owner',
          ownerEmail: email,
          email,
          restaurantId: buildFallbackRestaurantId(id),
          platform,
          isActive: true,
          isAcceptingOrders: true,
          onboarding: { completedSteps: 4 }
        }
      },
      { upsert: true }
    );

    inserted += 1;
  }

  console.log(`Restaurant restore completed. Inserted: ${inserted}, already present: ${skipped}, total refs: ${ids.length}`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Failed to restore restaurants:', error);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
