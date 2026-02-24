import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import HeroBanner from '../modules/heroBanner/models/HeroBanner.js';
import Under250Banner from '../modules/heroBanner/models/Under250Banner.js';
import LandingPageCategory from '../modules/heroBanner/models/LandingPageCategory.js';
import LandingPageExploreMore from '../modules/heroBanner/models/LandingPageExploreMore.js';
import LandingPageSettings from '../modules/heroBanner/models/LandingPageSettings.js';
import Top10Restaurant from '../modules/heroBanner/models/Top10Restaurant.js';
import GourmetRestaurant from '../modules/heroBanner/models/GourmetRestaurant.js';

dotenv.config();

const collections = [
  { name: 'HeroBanner', model: HeroBanner },
  { name: 'Under250Banner', model: Under250Banner },
  { name: 'LandingPageCategory', model: LandingPageCategory },
  { name: 'LandingPageExploreMore', model: LandingPageExploreMore },
  { name: 'LandingPageSettings', model: LandingPageSettings },
  { name: 'Top10Restaurant', model: Top10Restaurant },
  { name: 'GourmetRestaurant', model: GourmetRestaurant },
];

async function swapPlatformsForModel(name, model) {
  const mofoodCount = await model.countDocuments({ platform: 'mofood' });
  const mogroceryCount = await model.countDocuments({ platform: 'mogrocery' });

  // temp marker avoids double-flipping in one pass
  const tempMarker = '__swap_temp__';

  const r1 = await model.updateMany({ platform: 'mofood' }, { $set: { platform: tempMarker } });
  const r2 = await model.updateMany({ platform: 'mogrocery' }, { $set: { platform: 'mofood' } });
  const r3 = await model.updateMany({ platform: tempMarker }, { $set: { platform: 'mogrocery' } });

  console.log(
    `[${name}] before mofood=${mofoodCount}, mogrocery=${mogroceryCount} | updated: temp=${r1.modifiedCount}, toMofood=${r2.modifiedCount}, toMogrocery=${r3.modifiedCount}`
  );
}

async function run() {
  try {
    await connectDB();
    console.log('Connected. Swapping hero-banner platform data...');

    for (const { name, model } of collections) {
      await swapPlatformsForModel(name, model);
    }

    console.log('Swap completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Swap failed:', error);
    process.exit(1);
  }
}

run();
