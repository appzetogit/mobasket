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

const mofoodFilter = { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };

async function moveCollection(name, model) {
  const beforeMofood = await model.countDocuments(mofoodFilter);
  const beforeMogrocery = await model.countDocuments({ platform: 'mogrocery' });

  if (beforeMogrocery === 0) {
    console.log(
      `[${name}] skipped: no mogrocery records. mofood remains unchanged (count=${beforeMofood}).`
    );
    return;
  }

  // Replace mofood data only when mogrocery source exists.
  const deleted = await model.deleteMany(mofoodFilter);
  const moved = await model.updateMany({ platform: 'mogrocery' }, { $set: { platform: 'mofood' } });

  const afterMofood = await model.countDocuments(mofoodFilter);
  const afterMogrocery = await model.countDocuments({ platform: 'mogrocery' });

  console.log(
    `[${name}] before: mofood=${beforeMofood}, mogrocery=${beforeMogrocery} | deletedMofood=${deleted.deletedCount}, moved=${moved.modifiedCount} | after: mofood=${afterMofood}, mogrocery=${afterMogrocery}`
  );
}

async function run() {
  try {
    await connectDB();
    console.log('Connected. Moving mogrocery banner data to mofood...');

    for (const { name, model } of collections) {
      await moveCollection(name, model);
    }

    console.log('Migration complete: mogrocery banner data moved to mofood.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
