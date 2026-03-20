import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
};

const containsPoint = (zone, lat, lng) => {
    if (!zone.boundary || !zone.boundary.coordinates || !zone.boundary.coordinates[0]) {
        return false;
    }

    const coords = zone.boundary.coordinates[0];
    let inside = false;

    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const xi = Number(coords[i][0]), yi = Number(coords[i][1]);
        const xj = Number(coords[j][0]), yj = Number(coords[j][1]);

        if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
};

const run = async () => {
    await connectDB();

    try {
        const db = mongoose.connection.db;
        const GroceryStore = db.collection('grocery_stores');
        const Restaurant = db.collection('restaurants');
        const Zone = db.collection('zones');

        const activeZones = await Zone.find({ isActive: true, platform: 'mogrocery' }).toArray();
        console.log(`Found ${activeZones.length} active mogrocery zones.`);

        const storesWithNoZone = await GroceryStore.find({
            $or: [{ zoneId: null }, { zoneId: { $exists: false } }]
        }).toArray();
        console.log(`Found ${storesWithNoZone.length} grocery stores with no zoneId.`);

        const legacyStoresWithNoZone = await Restaurant.find({
            platform: { $in: ['mogrocery', 'grocery'] },
            $or: [{ zoneId: null }, { zoneId: { $exists: false } }]
        }).toArray();
        console.log(`Found ${legacyStoresWithNoZone.length} legacy mogrocery restaurants with no zoneId.`);

        let updatedCount = 0;

        const fixStores = async (collection, stores) => {
            for (const store of stores) {
                const lat = store.location?.latitude;
                const lng = store.location?.longitude;

                if (!lat || !lng) {
                    console.log(`- Skipping store "${store.name}" (ID: ${store._id}): No coordinates`);
                    continue;
                }

                let matchedZone = null;
                for (const zone of activeZones) {
                    if (containsPoint(zone, lat, lng)) {
                        matchedZone = zone;
                        break;
                    }
                }

                if (matchedZone) {
                    await collection.updateOne(
                        { _id: store._id },
                        { $set: { zoneId: matchedZone._id } }
                    );
                    console.log(`+ Updated store "${store.name}" -> Zone: ${matchedZone.name}`);
                    updatedCount++;
                } else {
                    console.log(`? No matching zone found for store "${store.name}" (${lat}, ${lng})`);
                }
            }
        };

        await fixStores(GroceryStore, storesWithNoZone);
        await fixStores(Restaurant, legacyStoresWithNoZone);

        console.log(`\nMaintenance complete. Updated ${updatedCount} stores.`);

    } catch (error) {
        console.error('Error during maintenance:', error);
    } finally {
        await mongoose.connection.close();
    }
};

run();
