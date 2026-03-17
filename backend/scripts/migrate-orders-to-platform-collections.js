import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

if (!MONGODB_URI) {
  console.error('MONGODB_URI (or MONGO_URI) not found in .env');
  process.exit(1);
}

const isMogroceryOrder = (order = {}) => {
  const restaurantPlatform = String(order.restaurantPlatform || order.platform || '').toLowerCase();
  const note = String(order.note || '');
  const restaurantName = String(order.restaurantName || '');

  if (restaurantPlatform === 'mogrocery') return true;
  if (/\[mogrocery\]/i.test(note)) return true;
  if (/mogrocery/i.test(restaurantName)) return true;
  return false;
};

const ensureIndexes = async (collection) => {
  await collection.createIndex({ orderId: 1 }, { unique: true, name: 'orderId_1' });
  await collection.createIndex({ orderNumber: 1 }, { name: 'orderNumber_1' });
  await collection.createIndex({ userId: 1, createdAt: -1 }, { name: 'userId_1_createdAt_-1' });
  await collection.createIndex({ restaurantId: 1, status: 1 }, { name: 'restaurantId_1_status_1' });
  await collection.createIndex({ status: 1, createdAt: -1 }, { name: 'status_1_createdAt_-1' });
  await collection.createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
  await collection.createIndex({ restaurantPlatform: 1, createdAt: -1 }, { name: 'restaurantPlatform_1_createdAt_-1' });
  await collection.createIndex({ 'payment.status': 1, createdAt: -1 }, { name: 'payment.status_1_createdAt_-1' });
  await collection.createIndex({ cancelledBy: 1, createdAt: -1 }, { name: 'cancelledBy_1_createdAt_-1' });
  await collection.createIndex({ status: 1, 'scheduledDelivery.scheduledFor': 1 }, { name: 'status_1_scheduledDelivery.scheduledFor_1' });
  await collection.createIndex({ 'payment.razorpayOrderId': 1 }, { name: 'payment.razorpayOrderId_1' });
};

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const source = db.collection('orders');
  const mofoodsTarget = db.collection('mofoodsorder');
  const mogroceryTarget = db.collection('mogroceryorder');

  console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY_RUN=true)' : ''}`);
  console.log('Starting migration from `orders` -> `mofoodsorder` / `mogroceryorder`...');

  const cursor = source.find({});

  let scanned = 0;
  let mofoodsUpserts = 0;
  let mogroceryUpserts = 0;

  while (await cursor.hasNext()) {
    const order = await cursor.next();
    if (!order) continue;
    scanned += 1;

    const targetIsMogrocery = isMogroceryOrder(order);
    const targetCollection = targetIsMogrocery ? mogroceryTarget : mofoodsTarget;
    const restaurantPlatform = targetIsMogrocery ? 'mogrocery' : 'mofood';

    const payload = { ...order, restaurantPlatform };

    if (!DRY_RUN) {
      const result = await targetCollection.updateOne(
        { _id: order._id },
        { $set: payload },
        { upsert: true }
      );

      if (result.modifiedCount > 0 || result.upsertedCount > 0) {
        if (targetIsMogrocery) {
          mogroceryUpserts += 1;
        } else {
          mofoodsUpserts += 1;
        }
      }
    }

    if (scanned % 500 === 0) {
      console.log(`Processed ${scanned} orders...`);
    }
  }

  if (!DRY_RUN) {
    await Promise.all([ensureIndexes(mofoodsTarget), ensureIndexes(mogroceryTarget)]);
  }

  console.log('Migration complete.');
  console.log(`Scanned: ${scanned}`);
  console.log(`MoFoods upserted/updated: ${mofoodsUpserts}`);
  console.log(`MoGrocery upserted/updated: ${mogroceryUpserts}`);

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Migration failed:', error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
