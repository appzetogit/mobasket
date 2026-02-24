import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GroceryProduct from '../modules/grocery/models/GroceryProduct.js';

dotenv.config();

const queryHintsBySlug = {
  'apple-royal-gala': ['Royal Gala apple', 'Apple fruit'],
  'aashirvaad-atta': ['Wheat flour', 'Flour'],
  'saffola-gold-oil': ['Sunflower oil', 'Cooking oil'],
  'amul-taaza-milk': ['Milk', 'Milk packet'],
};

async function fetchWikiSummaryImage(query) {
  const title = encodeURIComponent(query.trim());
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MoBasketImageBackfill/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return '';
    const data = await response.json();
    return data?.originalimage?.source || data?.thumbnail?.source || '';
  } catch {
    return '';
  }
}

async function fetchWikiSearchTitles(query) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '5',
    format: 'json',
  });
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MoBasketImageBackfill/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const results = Array.isArray(data?.query?.search) ? data.query.search : [];
    return results.map((item) => item?.title).filter(Boolean);
  } catch {
    return [];
  }
}

function sanitizeName(name = '') {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveImageForProduct(product) {
  const hints = queryHintsBySlug[product.slug] || [];
  const baseName = sanitizeName(product.name || '');
  const candidates = [...hints, baseName, ...baseName.split(' ').slice(-2)].filter(Boolean);

  for (const query of candidates) {
    const directImage = await fetchWikiSummaryImage(query);
    if (directImage) return directImage;

    const searchTitles = await fetchWikiSearchTitles(query);
    for (const title of searchTitles) {
      const image = await fetchWikiSummaryImage(title);
      if (image) return image;
    }
  }

  return '';
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const missingProducts = await GroceryProduct.find({
      $or: [{ images: { $exists: false } }, { images: { $size: 0 } }],
    });

    let updated = 0;
    for (const product of missingProducts) {
      const imageUrl = await resolveImageForProduct(product);
      if (!imageUrl) continue;

      product.images = [imageUrl];
      await product.save();
      updated += 1;
      console.log(`Updated image for: ${product.name}`);
    }

    console.log(`Backfill complete. Updated ${updated}/${missingProducts.length} products.`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to backfill grocery product images:', error);
    process.exit(1);
  }
}

run();

