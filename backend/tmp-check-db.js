import mongoose from 'mongoose';
import dotenv from 'dotenv';
import GroceryProduct from './modules/grocery/models/GroceryProduct.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const product = await GroceryProduct.findById('69fbfdf25c1363055514d3d7').lean();
    console.log('Product details:', JSON.stringify(product, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
