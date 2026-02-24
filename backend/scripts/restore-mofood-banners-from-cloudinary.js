import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import { cloudinary, initializeCloudinary } from '../config/cloudinary.js';
import HeroBanner from '../modules/heroBanner/models/HeroBanner.js';
import Under250Banner from '../modules/heroBanner/models/Under250Banner.js';

dotenv.config();

const mofoodFilter = { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };

async function listResourcesByPrefixes(prefixes) {
  const all = [];

  for (const prefix of prefixes) {
    let nextCursor = null;
    do {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix,
        max_results: 500,
        next_cursor: nextCursor || undefined,
      });

      all.push(...(result.resources || []));
      nextCursor = result.next_cursor || null;
    } while (nextCursor);
  }

  const byPublicId = new Map();
  for (const resource of all) {
    byPublicId.set(resource.public_id, resource);
  }

  return Array.from(byPublicId.values()).sort((a, b) => {
    const t1 = new Date(a.created_at).getTime();
    const t2 = new Date(b.created_at).getTime();
    return t1 - t2;
  });
}

async function restoreHeroBanners() {
  const existing = await HeroBanner.countDocuments(mofoodFilter);
  if (existing > 0) {
    console.log(`[HeroBanner] skipped restore: mofood records already exist (${existing}).`);
    return;
  }

  const resources = await listResourcesByPrefixes(['appzeto/mofood/hero-banners', 'appzeto/hero-banners']);
  if (resources.length === 0) {
    console.log('[HeroBanner] no Cloudinary resources found for restore.');
    return;
  }

  const docs = resources.map((r, index) => ({
    platform: 'mofood',
    imageUrl: r.secure_url,
    cloudinaryPublicId: r.public_id,
    order: index,
    isActive: true,
  }));

  await HeroBanner.insertMany(docs);
  console.log(`[HeroBanner] restored ${docs.length} records to mofood.`);
}

async function restoreUnder250Banners() {
  const existing = await Under250Banner.countDocuments(mofoodFilter);
  if (existing > 0) {
    console.log(`[Under250Banner] skipped restore: mofood records already exist (${existing}).`);
    return;
  }

  const resources = await listResourcesByPrefixes(['appzeto/mofood/under-250-banners', 'appzeto/under-250-banners']);
  if (resources.length === 0) {
    console.log('[Under250Banner] no Cloudinary resources found for restore.');
    return;
  }

  const docs = resources.map((r, index) => ({
    platform: 'mofood',
    imageUrl: r.secure_url,
    cloudinaryPublicId: r.public_id,
    order: index,
    isActive: true,
  }));

  await Under250Banner.insertMany(docs);
  console.log(`[Under250Banner] restored ${docs.length} records to mofood.`);
}

async function run() {
  try {
    await connectDB();
    await initializeCloudinary();

    console.log('Restoring mofood banners from Cloudinary...');
    await restoreHeroBanners();
    await restoreUnder250Banners();

    console.log('Restore completed.');
    process.exit(0);
  } catch (error) {
    console.error('Restore failed:', error);
    process.exit(1);
  }
}

run();
