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
    // Define Schema for GroceryStore and Zone
    const GroceryStore = mongoose.model('GroceryStore', new mongoose.Schema({
        name: String,
        zoneId: mongoose.Schema.Types.ObjectId,
        isActive: Boolean,
        platform: String
    }, { collection: 'grocery_stores' }));

    const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({
        name: String,
        zoneId: mongoose.Schema.Types.ObjectId,
        isActive: Boolean,
        platform: String
    }, { collection: 'restaurants' }));

    const Zone = mongoose.model('Zone', new mongoose.Schema({
        name: String,
        platform: String,
        isActive: Boolean
    }, { collection: 'zones' }));

    const stores = await GroceryStore.find({}).lean();
    const legacyStores = await Restaurant.find({ platform: { $in: ['mogrocery', 'grocery'] } }).lean();
    const zones = await Zone.find({}).lean();

    console.log(`Total GroceryStore docs: ${stores.length}`);
    console.log(`Total legacy mogrocery/grocery restaurants: ${legacyStores.length}`);
    console.log(`Total zones: ${zones.length}`);

    const zonesMap = new Map();
    zones.forEach(z => zonesMap.set(String(z._id), `${z.name} [${z.platform || 'no-platform'}]`));

    const allStores = [...stores, ...legacyStores];
    const storesByZone = {};
    
    allStores.forEach(s => {
        const zid = String(s.zoneId || 'none');
        if (!storesByZone[zid]) storesByZone[zid] = [];
        storesByZone[zid].push(s.name);
    });

    console.log('\nAll Stores by Zone ID:');
    for (const [zid, names] of Object.entries(storesByZone)) {
        const zoneInfo = zonesMap.get(zid) || 'Unknown/None';
        console.log(`${zoneInfo} (${zid}): ${names.length} stores -> ${names.join(', ')}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
};

run();
