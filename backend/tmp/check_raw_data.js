import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();
  
  try {
    const db = mongoose.connection.db;
    const store = await db.collection('grocery_stores').findOne({});
    console.log('Sample Grocery Store:', JSON.stringify(store, null, 2));

    const restaurant = await db.collection('restaurants').findOne({ platform: 'mogrocery' });
    if (restaurant) {
        console.log('Sample Legacy Mogrocery Restaurant:', JSON.stringify(restaurant, null, 2));
    }

    const zones = await db.collection('zones').find({}).toArray();
    console.log('All Zones (IDs and Names):');
    zones.forEach(z => console.log(`${z._id} : ${z.name} [${z.platform}]`));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
};

run();
