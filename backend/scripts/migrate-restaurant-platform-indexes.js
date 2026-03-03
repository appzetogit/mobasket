import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in .env');
  process.exit(1);
}

async function dropIfExists(collection, indexName) {
  try {
    await collection.dropIndex(indexName);
    console.log(`Dropped index: ${indexName}`);
  } catch (error) {
    if (error?.codeName === 'IndexNotFound' || error?.code === 27) {
      console.log(`Index not found (skip): ${indexName}`);
      return;
    }
    throw error;
  }
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const restaurants = db.collection('restaurants');

  console.log('Connected. Migrating restaurant indexes...');

  // Legacy global unique indexes blocked same phone/email across platforms.
  await dropIfExists(restaurants, 'email_1');
  await dropIfExists(restaurants, 'phone_1');

  // New per-platform unique indexes.
  await restaurants.createIndex(
    { email: 1, platform: 1 },
    {
      unique: true,
      name: 'email_1_platform_1',
      partialFilterExpression: { email: { $type: 'string' } }
    }
  );
  await restaurants.createIndex(
    { phone: 1, platform: 1 },
    {
      unique: true,
      name: 'phone_1_platform_1',
      partialFilterExpression: { phone: { $type: 'string' } }
    }
  );

  console.log('Restaurant platform index migration complete.');
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Migration failed:', error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
