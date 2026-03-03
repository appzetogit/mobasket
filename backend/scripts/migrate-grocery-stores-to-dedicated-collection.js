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

async function ensureIndexes(collection) {
  await collection.createIndex(
    { email: 1 },
    {
      unique: true,
      name: 'email_1',
      partialFilterExpression: { email: { $type: 'string' } }
    }
  );
  await collection.createIndex(
    { phone: 1 },
    {
      unique: true,
      name: 'phone_1',
      partialFilterExpression: { phone: { $type: 'string' } }
    }
  );
  await collection.createIndex({ platform: 1 }, { name: 'platform_1' });
  await collection.createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const restaurants = db.collection('restaurants');
  const groceryStores = db.collection('grocery_stores');

  console.log('Connected. Migrating grocery stores to dedicated collection...');

  const cursor = restaurants.find({ platform: 'mogrocery' });

  let scanned = 0;
  let upserted = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;
    scanned += 1;

    const { _id, ...rest } = doc;
    rest.platform = 'mogrocery';

    const result = await groceryStores.updateOne(
      { _id },
      { $set: rest },
      { upsert: true }
    );

    if (result.upsertedCount > 0 || result.modifiedCount > 0) {
      upserted += 1;
    }

    if (scanned % 200 === 0) {
      console.log(`Processed ${scanned} records...`);
    }
  }

  await ensureIndexes(groceryStores);

  console.log(`Done. Scanned: ${scanned}, upserted/updated: ${upserted}`);
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Migration failed:', error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});

