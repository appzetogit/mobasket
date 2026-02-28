import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI (or MONGO_URI) is missing.');
  process.exit(1);
}

async function dropStaleDeliveryMobileIndex() {
  try {
    await mongoose.connect(MONGODB_URI);
    const collection = mongoose.connection.db.collection('deliveries');
    const indexes = await collection.indexes();
    const hasMobileIndex = indexes.some((idx) => idx.name === 'mobile_1');

    if (!hasMobileIndex) {
      console.log('No stale mobile_1 index found on deliveries.');
      return;
    }

    await collection.dropIndex('mobile_1');
    console.log('Dropped stale deliveries.mobile_1 index successfully.');
  } catch (error) {
    console.error('Failed to drop deliveries.mobile_1 index:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

dropStaleDeliveryMobileIndex();
