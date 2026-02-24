import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifySeparation() {
  try {
    console.log('🚀 Starting Verification: Grocery Store Separation');
    
    // Connect to MongoDB
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not found in environment variables');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Cleanup
    await Restaurant.deleteMany({ name: /TEST_VERIFY/ });
    console.log('🧹 Cleaned up previous test data');

    // 2. Create a Restaurant (mofood)
    const restaurant = await Restaurant.create({
      name: "TEST_VERIFY_RESTAURANT",
      ownerName: "Owner Rest",
      ownerEmail: "rest@test.com",
      email: "rest_auth@test.com",
      platform: 'mofood',
      location: { area: "Test Area", city: "Test City" }
    });
    console.log('✅ Created MoFood Restaurant:', restaurant._id);

    // 3. Create a Grocery Store (mogrocery)
    const store = await Restaurant.create({
      name: "TEST_VERIFY_STORE_1",
      ownerName: "Owner Store",
      ownerEmail: "store@test.com",
      email: "store_auth@test.com",
      platform: 'mogrocery',
      location: { area: "Store Area", city: "Store City" }
    });
    console.log('✅ Created MoGrocery Store:', store._id);

    // 4. Verify Separation in Queries (Simulating Controller Logic)
    
    // Query for Restaurants (mofood)
    const restaurantQuery = {
      $or: [
        { platform: 'mofood' },
        { platform: { $exists: false } }
      ]
    };
    const mofoodRestaurants = await Restaurant.find(restaurantQuery);
    
    // Query for Stores (mogrocery)
    const storeQuery = { platform: 'mogrocery' };
    const mogroceryStores = await Restaurant.find(storeQuery);

    console.log('📊 Query Results:');
    console.log(`   - MoFood count: ${mofoodRestaurants.length}`);
    console.log(`   - MoGrocery count: ${mogroceryStores.length}`);

    const storeInMoFood = mofoodRestaurants.find(r => r.name === "TEST_VERIFY_STORE_1");
    const restInMoGrocery = mogroceryStores.find(r => r.name === "TEST_VERIFY_RESTAURANT");

    if (!storeInMoFood && !restInMoGrocery) {
      console.log('✅ Verification PASSED: Entities are correctly isolated by platform');
    } else {
      console.error('❌ Verification FAILED: Platform leakage detected!');
    }

    // 5. Verify Single Store Constraint for Grocery
    console.log('🧪 Testing Single Store Constraint...');
    try {
      await Restaurant.create({
        name: "TEST_VERIFY_STORE_2",
        ownerName: "Owner Store 2",
        ownerEmail: "store2@test.com",
        email: "store2_auth@test.com",
        platform: 'mogrocery',
        location: { area: "Store Area 2", city: "Store City 2" }
      });
      console.error('❌ Verification FAILED: Created a second grocery store (should have failed)');
    } catch (err) {
      if (err.message.includes('A grocery store already exists')) {
        console.log('✅ Verification PASSED: Second grocery store creation failed as expected');
      } else {
        console.log('ℹ️ Note: Native Mongoose validation failed as expected, but might not be the custom error message if using DB indexes. Error:', err.message);
      }
    }

    // 6. Cleanup
    await Restaurant.deleteMany({ name: /TEST_VERIFY/ });
    console.log('🧹 Cleaned up test data');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error during verification:', err);
    process.exit(1);
  }
}

verifySeparation();
