import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function debug() {
  try {
    console.log('MONGO_URI:', process.env.MONGO_URI ? 'FOUND' : 'MISSING');
    if (process.env.MONGO_URI) {
      console.log('Attempting to connect...');
      await mongoose.connect(process.env.MONGO_URI);
      console.log('✅ Connected');
      await mongoose.disconnect();
      console.log('✅ Disconnected');
    }
    
    console.log('Attempting to import Restaurant model...');
    const Restaurant = await import('../modules/restaurant/models/Restaurant.js');
    console.log('✅ Imported:', Restaurant.default ? 'has default' : 'no default');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

debug();
