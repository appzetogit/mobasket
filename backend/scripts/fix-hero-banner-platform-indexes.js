import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import Top10Restaurant from '../modules/heroBanner/models/Top10Restaurant.js';
import GourmetRestaurant from '../modules/heroBanner/models/GourmetRestaurant.js';

dotenv.config();

async function dropIndexIfExists(collection, indexName) {
  try {
    await collection.dropIndex(indexName);
    console.log(`Dropped index: ${indexName}`);
  } catch (error) {
    if (error?.codeName === 'IndexNotFound') {
      console.log(`Index not found (skipped): ${indexName}`);
      return;
    }
    throw error;
  }
}

async function run() {
  try {
    await connectDB();

    const top10Collection = mongoose.connection.collection('top10restaurants');
    const gourmetCollection = mongoose.connection.collection('gourmetrestaurants');

    console.log('Checking old Top10 indexes...');
    await dropIndexIfExists(top10Collection, 'restaurant_1');
    await dropIndexIfExists(top10Collection, 'rank_1');

    console.log('Checking old Gourmet indexes...');
    await dropIndexIfExists(gourmetCollection, 'restaurant_1');

    console.log('Syncing new platform-scoped indexes...');
    await Top10Restaurant.syncIndexes();
    await GourmetRestaurant.syncIndexes();

    console.log('Hero banner platform index migration completed.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to migrate hero banner platform indexes:', error);
    process.exit(1);
  }
}

run();
