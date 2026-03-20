import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    try {
        const db = mongoose.connection.db;
        const stores = await db.collection('grocery_stores').find({}).toArray();
        const zones = await db.collection('zones').find({ platform: 'mogrocery' }).toArray();
        
        const zoneMap = {};
        zones.forEach(z => zoneMap[String(z._id)] = z.name);

        console.log('--- Verification Report ---');
        let assigned = 0;
        let unassigned = 0;

        stores.forEach(s => {
            if (s.zoneId) {
                console.log(`[OK] Store: "${s.name}" -> Zone: ${zoneMap[String(s.zoneId)] || s.zoneId}`);
                assigned++;
            } else {
                console.log(`[MISSING] Store: "${s.name}" -> NO ZONE (Coord: ${s.location?.latitude}, ${s.location?.longitude})`);
                unassigned++;
            }
        });

        console.log(`\nSummary: ${assigned} assigned, ${unassigned} unassigned.`);

    } finally {
        await mongoose.connection.close();
    }
};

run();
