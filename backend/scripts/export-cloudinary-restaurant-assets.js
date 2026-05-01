import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

import { connectDB } from '../config/database.js';
import { cloudinary, initializeCloudinary } from '../config/cloudinary.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import GroceryStore from '../modules/grocery/models/GroceryStore.js';
import Menu from '../modules/restaurant/models/Menu.js';
import AdminCategoryManagement from '../modules/admin/models/AdminCategoryManagement.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import GroceryCategory from '../modules/grocery/models/GroceryCategory.js';
import GrocerySubcategory from '../modules/grocery/models/GrocerySubcategory.js';
import HeroBanner from '../modules/heroBanner/models/HeroBanner.js';
import Under250Banner from '../modules/heroBanner/models/Under250Banner.js';
import DiningBanner from '../modules/heroBanner/models/DiningBanner.js';
import LandingPageCategory from '../modules/heroBanner/models/LandingPageCategory.js';
import LandingPageExploreMore from '../modules/heroBanner/models/LandingPageExploreMore.js';
import MofoodProductSectionItem from '../modules/heroBanner/models/MofoodProductSectionItem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'exports', `restaurant-assets-backup-${new Date().toISOString().slice(0, 10)}`);
const OUTPUT_DIR = path.resolve(process.argv[2] || DEFAULT_OUTPUT_DIR);
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const SUMMARY_PATH = path.join(OUTPUT_DIR, 'summary.json');

const CLOUDINARY_HOST_PATTERN = /(?:^|\.)cloudinary\.com$/i;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeSegment(value, fallback = 'unknown') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function safeFileExtension(url, format = '') {
  const normalizedFormat = String(format || '').trim().toLowerCase();
  if (normalizedFormat) return normalizedFormat;

  try {
    const pathname = new URL(url).pathname || '';
    const ext = path.extname(pathname).replace(/^\./, '').toLowerCase();
    if (ext) return ext;
  } catch {}

  return 'bin';
}

function inferCloudinaryPublicId(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    if (!CLOUDINARY_HOST_PATTERN.test(parsed.hostname)) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    const uploadIndex = parts.findIndex((part) => part === 'upload');
    if (uploadIndex === -1) return null;

    const trailing = parts.slice(uploadIndex + 1);
    const versionIndex = trailing.findIndex((part) => /^v\d+$/i.test(part));
    const publicIdParts = versionIndex === -1 ? trailing : trailing.slice(versionIndex + 1);
    if (!publicIdParts.length) return null;

    const filename = publicIdParts.join('/');
    return filename.replace(/\.[^.]+$/, '');
  } catch {
    return null;
  }
}

function isCloudinaryUrl(url) {
  try {
    return CLOUDINARY_HOST_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function normalizeImage(input) {
  if (!input) return null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return {
      url: trimmed,
      publicId: inferCloudinaryPublicId(trimmed),
      raw: input,
    };
  }

  if (typeof input === 'object') {
    const url = String(
      input.url ||
      input.image ||
      input.imageUrl ||
      input.secure_url ||
      input.src ||
      ''
    ).trim();

    if (!url) return null;

    const publicId = String(
      input.publicId ||
      input.public_id ||
      input.cloudinaryPublicId ||
      inferCloudinaryPublicId(url) ||
      ''
    ).trim();

    return {
      url,
      publicId: publicId || null,
      raw: input,
    };
  }

  return null;
}

function createAssetRecord({
  scope,
  category,
  platform,
  sourceModel,
  sourceId,
  sourceField,
  ownerKey,
  ownerLabel,
  image,
  extra = {},
}) {
  const normalized = normalizeImage(image);
  if (!normalized?.url) return null;
  if (normalized.url.trim().toLowerCase().startsWith('data:')) return null;

  return {
    assetKey: `${sourceModel}:${sourceId}:${sourceField}:${normalized.publicId || normalized.url}`,
    scope,
    category,
    platform: platform || 'unknown',
    sourceModel,
    sourceId: String(sourceId || ''),
    sourceField,
    ownerKey: ownerKey || null,
    ownerLabel: ownerLabel || null,
    url: normalized.url,
    publicId: normalized.publicId || null,
    isCloudinary: isCloudinaryUrl(normalized.url),
    extra,
  };
}

async function collectCategoryAssets() {
  const [adminCategories, restaurantCategories, groceryCategories, grocerySubcategories] = await Promise.all([
    AdminCategoryManagement.find({}, {
      name: 1,
      image: 1,
      type: 1,
      priority: 1,
      status: 1,
    }).lean(),
    RestaurantCategory.find({}, {
      restaurant: 1,
      name: 1,
      icon: 1,
      color: 1,
      order: 1,
      isActive: 1,
    }).populate({
      path: 'restaurant',
      select: 'restaurantId name slug platform',
    }).lean(),
    GroceryCategory.find({}, {
      name: 1,
      slug: 1,
      image: 1,
      section: 1,
      order: 1,
      isActive: 1,
    }).lean(),
    GrocerySubcategory.find({}, {
      category: 1,
      name: 1,
      slug: 1,
      image: 1,
      order: 1,
      isActive: 1,
    }).populate({
      path: 'category',
      select: 'name slug section',
    }).lean(),
  ]);

  const assets = [];

  adminCategories.forEach((category) => {
    const record = createAssetRecord({
      scope: 'category',
      category: 'admin-category-image',
      platform: 'mofood',
      sourceModel: 'AdminCategoryManagement',
      sourceId: category._id,
      sourceField: 'image',
      ownerKey: category.name || String(category._id),
      ownerLabel: category.name || null,
      image: category.image,
      extra: {
        name: category.name || null,
        type: category.type || null,
        priority: category.priority || null,
        status: category.status ?? null,
      },
    });
    if (record) assets.push(record);
  });

  restaurantCategories.forEach((category) => {
    const restaurant = category.restaurant;
    const ownerKey = restaurant?.restaurantId || restaurant?.slug || String(category._id);
    const ownerLabel = restaurant?.name ? `${restaurant.name} / ${category.name}` : category.name;

    const record = createAssetRecord({
      scope: 'category',
      category: 'restaurant-category-image',
      platform: restaurant?.platform || 'mofood',
      sourceModel: 'RestaurantCategory',
      sourceId: category._id,
      sourceField: 'icon',
      ownerKey,
      ownerLabel,
      image: category.icon,
      extra: {
        categoryName: category.name || null,
        color: category.color || null,
        order: category.order ?? 0,
        isActive: !!category.isActive,
        restaurantId: restaurant?.restaurantId || null,
        restaurantMongoId: restaurant?._id ? String(restaurant._id) : null,
        restaurantName: restaurant?.name || null,
        slug: restaurant?.slug || null,
      },
    });
    if (record) assets.push(record);
  });

  groceryCategories.forEach((category) => {
    const record = createAssetRecord({
      scope: 'category',
      category: 'grocery-category-image',
      platform: 'mogrocery',
      sourceModel: 'GroceryCategory',
      sourceId: category._id,
      sourceField: 'image',
      ownerKey: category.slug || category.name || String(category._id),
      ownerLabel: category.name || null,
      image: category.image,
      extra: {
        name: category.name || null,
        slug: category.slug || null,
        section: category.section || null,
        order: category.order ?? 0,
        isActive: !!category.isActive,
      },
    });
    if (record) assets.push(record);
  });

  grocerySubcategories.forEach((subcategory) => {
    const record = createAssetRecord({
      scope: 'category',
      category: 'grocery-subcategory-image',
      platform: 'mogrocery',
      sourceModel: 'GrocerySubcategory',
      sourceId: subcategory._id,
      sourceField: 'image',
      ownerKey: subcategory.slug || subcategory.name || String(subcategory._id),
      ownerLabel: subcategory.name || null,
      image: subcategory.image,
      extra: {
        name: subcategory.name || null,
        slug: subcategory.slug || null,
        order: subcategory.order ?? 0,
        isActive: !!subcategory.isActive,
        parentCategoryId: subcategory.category?._id ? String(subcategory.category._id) : null,
        parentCategoryName: subcategory.category?.name || null,
        parentCategorySlug: subcategory.category?.slug || null,
        parentSection: subcategory.category?.section || null,
      },
    });
    if (record) assets.push(record);
  });

  return assets;
}

async function enrichCloudinaryMetadata(records) {
  const publicIds = [...new Set(records.map((record) => record.publicId).filter(Boolean))];
  const metadataByPublicId = new Map();

  for (const publicId of publicIds) {
    try {
      const resource = await cloudinary.api.resource(publicId, { resource_type: 'image' });
      metadataByPublicId.set(publicId, {
        assetId: resource.asset_id || null,
        publicId: resource.public_id || publicId,
        format: resource.format || null,
        version: resource.version || null,
        bytes: resource.bytes || null,
        width: resource.width || null,
        height: resource.height || null,
        createdAt: resource.created_at || null,
        folder: resource.folder || null,
        resourceType: resource.resource_type || null,
        type: resource.type || null,
        tags: Array.isArray(resource.tags) ? resource.tags : [],
        originalFilename: resource.original_filename || null,
        secureUrl: resource.secure_url || null,
      });
    } catch (error) {
      metadataByPublicId.set(publicId, {
        lookupError: error?.message || String(error),
      });
    }
  }

  return records.map((record) => ({
    ...record,
    cloudinary: record.publicId ? (metadataByPublicId.get(record.publicId) || null) : null,
  }));
}

async function downloadAsset(record, index) {
  const metadata = record.cloudinary || {};
  const preferredUrl = metadata.secureUrl || record.url;
  const extension = safeFileExtension(preferredUrl, metadata.format);
  const baseName = sanitizeSegment(
    metadata.originalFilename ||
    record.ownerKey ||
    record.publicId?.split('/').pop() ||
    `${record.category}-${index + 1}`
  );

  const relativePath = path.join(
    'files',
    sanitizeSegment(record.platform || 'unknown'),
    sanitizeSegment(record.category),
    `${String(index + 1).padStart(4, '0')}-${baseName}.${extension}`
  );
  const absolutePath = path.join(OUTPUT_DIR, relativePath);

  ensureDir(path.dirname(absolutePath));

  const response = await axios({
    method: 'get',
    url: preferredUrl,
    responseType: 'stream',
    timeout: 120000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      Referer: 'https://www.google.com/',
    },
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(absolutePath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const stats = fs.statSync(absolutePath);
  return {
    ...record,
    downloadedFile: {
      relativePath: relativePath.replace(/\\/g, '/'),
      absolutePath,
      sizeBytes: stats.size,
      contentType: response.headers['content-type'] || null,
      lastModified: response.headers['last-modified'] || null,
      etag: response.headers.etag || null,
    },
  };
}

function dedupeRecords(records) {
  const seen = new Set();
  const deduped = [];

  for (const record of records) {
    const dedupeKey = record.publicId || record.url;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(record);
  }

  return deduped;
}

async function collectRestaurantAssets() {
  const restaurants = await Restaurant.find({}, {
    restaurantId: 1,
    name: 1,
    slug: 1,
    platform: 1,
    profileImage: 1,
    menuImages: 1,
  }).lean();

  const assets = [];

  for (const restaurant of restaurants) {
    const platform = restaurant.platform || 'mofood';
    const ownerKey = restaurant.restaurantId || restaurant.slug || String(restaurant._id);
    const ownerLabel = restaurant.name || ownerKey;

    const profileRecord = createAssetRecord({
      scope: 'restaurant',
      category: 'restaurant-profile',
      platform,
      sourceModel: 'Restaurant',
      sourceId: restaurant._id,
      sourceField: 'profileImage',
      ownerKey,
      ownerLabel,
      image: restaurant.profileImage,
      extra: {
        restaurantId: restaurant.restaurantId || null,
        slug: restaurant.slug || null,
        name: restaurant.name || null,
      },
    });
    if (profileRecord) assets.push(profileRecord);

    (restaurant.menuImages || []).forEach((image, imageIndex) => {
      const menuRecord = createAssetRecord({
        scope: 'restaurant',
        category: imageIndex === 0 ? 'restaurant-banner' : 'restaurant-menu',
        platform,
        sourceModel: 'Restaurant',
        sourceId: restaurant._id,
        sourceField: `menuImages.${imageIndex}`,
        ownerKey,
        ownerLabel,
        image,
        extra: {
          restaurantId: restaurant.restaurantId || null,
          slug: restaurant.slug || null,
          name: restaurant.name || null,
          imageIndex,
        },
      });
      if (menuRecord) assets.push(menuRecord);
    });
  }

  return assets;
}

async function collectGroceryStoreAssets() {
  const stores = await GroceryStore.find({}, {
    restaurantId: 1,
    name: 1,
    slug: 1,
    platform: 1,
    profileImage: 1,
    menuImages: 1,
    onboarding: 1,
  }).lean();

  const assets = [];

  for (const store of stores) {
    const platform = store.platform || 'mogrocery';
    const ownerKey = store.restaurantId || store.slug || String(store._id);
    const ownerLabel = store.name || ownerKey;

    const profileRecord = createAssetRecord({
      scope: 'store',
      category: 'grocery-store-profile',
      platform,
      sourceModel: 'GroceryStore',
      sourceId: store._id,
      sourceField: 'profileImage',
      ownerKey,
      ownerLabel,
      image: store.profileImage,
      extra: {
        restaurantId: store.restaurantId || null,
        slug: store.slug || null,
        name: store.name || null,
      },
    });
    if (profileRecord) assets.push(profileRecord);

    (store.menuImages || []).forEach((image, imageIndex) => {
      const menuRecord = createAssetRecord({
        scope: 'store',
        category: imageIndex === 0 ? 'grocery-store-banner' : 'grocery-store-menu',
        platform,
        sourceModel: 'GroceryStore',
        sourceId: store._id,
        sourceField: `menuImages.${imageIndex}`,
        ownerKey,
        ownerLabel,
        image,
        extra: {
          restaurantId: store.restaurantId || null,
          slug: store.slug || null,
          name: store.name || null,
          imageIndex,
        },
      });
      if (menuRecord) assets.push(menuRecord);
    });

    const onboardingStoreImage = createAssetRecord({
      scope: 'store',
      category: 'grocery-store-onboarding-image',
      platform,
      sourceModel: 'GroceryStore',
      sourceId: store._id,
      sourceField: 'onboarding.storeImage',
      ownerKey,
      ownerLabel,
      image: store.onboarding?.storeImage,
      extra: {
        restaurantId: store.restaurantId || null,
        slug: store.slug || null,
        name: store.name || null,
      },
    });
    if (onboardingStoreImage) assets.push(onboardingStoreImage);

    (store.onboarding?.additionalImages || []).forEach((image, imageIndex) => {
      const additionalRecord = createAssetRecord({
        scope: 'store',
        category: 'grocery-store-additional-image',
        platform,
        sourceModel: 'GroceryStore',
        sourceId: store._id,
        sourceField: `onboarding.additionalImages.${imageIndex}`,
        ownerKey,
        ownerLabel,
        image,
        extra: {
          restaurantId: store.restaurantId || null,
          slug: store.slug || null,
          name: store.name || null,
          imageIndex,
        },
      });
      if (additionalRecord) assets.push(additionalRecord);
    });
  }

  return assets;
}

async function collectModelAssets(Model, options) {
  const docs = await Model.find({}, options.select || {}).lean();
  const assets = [];

  for (const doc of docs) {
    const imageRecord = createAssetRecord({
      scope: options.scope,
      category: options.category,
      platform: options.platformResolver ? options.platformResolver(doc) : doc.platform,
      sourceModel: options.sourceModel,
      sourceId: doc._id,
      sourceField: options.sourceField || 'imageUrl',
      ownerKey: options.ownerKeyResolver ? options.ownerKeyResolver(doc) : String(doc._id),
      ownerLabel: options.ownerLabelResolver ? options.ownerLabelResolver(doc) : null,
      image: options.imageResolver ? options.imageResolver(doc) : doc.imageUrl,
      extra: options.extraResolver ? options.extraResolver(doc) : {},
    });
    if (imageRecord) assets.push(imageRecord);
  }

  return assets;
}

async function collectRestaurantMenuItemAssets() {
  const menus = await Menu.find({}, {
    restaurant: 1,
    sections: 1,
    addons: 1,
  }).populate({
    path: 'restaurant',
    select: 'restaurantId name slug platform',
  }).lean();

  const assets = [];

  const pushItemAssets = (item, context) => {
    const imageCandidates = [];
    const primaryImage = normalizeImage(item?.image);
    if (primaryImage?.url) {
      imageCandidates.push({
        sourceField: `${context.baseField}.image`,
        image: primaryImage,
        imageIndex: null,
      });
    }

    (Array.isArray(item?.images) ? item.images : []).forEach((image, imageIndex) => {
      const normalized = normalizeImage(image);
      if (!normalized?.url) return;
      imageCandidates.push({
        sourceField: `${context.baseField}.images.${imageIndex}`,
        image: normalized,
        imageIndex,
      });
    });

    for (const candidate of imageCandidates) {
      if (!candidate.image.publicId && !isCloudinaryUrl(candidate.image.url)) {
        continue;
      }

      const record = createAssetRecord({
        scope: 'menu-item',
        category: context.category,
        platform: context.platform,
        sourceModel: 'Menu',
        sourceId: context.menuId,
        sourceField: candidate.sourceField,
        ownerKey: context.ownerKey,
        ownerLabel: context.ownerLabel,
        image: candidate.image,
        extra: {
          restaurantId: context.restaurantId,
          restaurantMongoId: context.restaurantMongoId,
          slug: context.slug,
          sectionId: context.sectionId,
          sectionName: context.sectionName,
          subsectionId: context.subsectionId,
          subsectionName: context.subsectionName,
          itemId: item?.id || null,
          itemName: item?.name || null,
          imageIndex: candidate.imageIndex,
        },
      });

      if (record) assets.push(record);
    }
  };

  for (const menu of menus) {
    const restaurant = menu.restaurant;
    if (!restaurant?._id) continue;

    const platform = restaurant.platform || 'mofood';
    const ownerKey = restaurant.restaurantId || restaurant.slug || String(restaurant._id);
    const ownerLabel = restaurant.name || ownerKey;

    (Array.isArray(menu.sections) ? menu.sections : []).forEach((section, sectionIndex) => {
      (Array.isArray(section.items) ? section.items : []).forEach((item, itemIndex) => {
        pushItemAssets(item, {
          category: 'restaurant-menu-item-image',
          baseField: `sections.${sectionIndex}.items.${itemIndex}`,
          platform,
          menuId: menu._id,
          ownerKey,
          ownerLabel,
          restaurantId: restaurant.restaurantId || null,
          restaurantMongoId: String(restaurant._id),
          slug: restaurant.slug || null,
          sectionId: section?.id || null,
          sectionName: section?.name || null,
          subsectionId: null,
          subsectionName: null,
        });
      });

      (Array.isArray(section.subsections) ? section.subsections : []).forEach((subsection, subsectionIndex) => {
        (Array.isArray(subsection.items) ? subsection.items : []).forEach((item, itemIndex) => {
          pushItemAssets(item, {
            category: 'restaurant-menu-item-image',
            baseField: `sections.${sectionIndex}.subsections.${subsectionIndex}.items.${itemIndex}`,
            platform,
            menuId: menu._id,
            ownerKey,
            ownerLabel,
            restaurantId: restaurant.restaurantId || null,
            restaurantMongoId: String(restaurant._id),
            slug: restaurant.slug || null,
            sectionId: section?.id || null,
            sectionName: section?.name || null,
            subsectionId: subsection?.id || null,
            subsectionName: subsection?.name || null,
          });
        });
      });
    });

    (Array.isArray(menu.addons) ? menu.addons : []).forEach((addon, addonIndex) => {
      pushItemAssets(addon, {
        category: 'restaurant-addon-image',
        baseField: `addons.${addonIndex}`,
        platform,
        menuId: menu._id,
        ownerKey,
        ownerLabel,
        restaurantId: restaurant.restaurantId || null,
        restaurantMongoId: String(restaurant._id),
        slug: restaurant.slug || null,
        sectionId: null,
        sectionName: null,
        subsectionId: null,
        subsectionName: null,
      });
    });
  }

  return assets;
}

async function collectAssets() {
  const [restaurantAssets, groceryStoreAssets, restaurantMenuItemAssets, categoryAssets, heroBanners, under250Banners, diningBanners, landingCategories, landingExploreMore, mofoodProductSectionItems] = await Promise.all([
    collectRestaurantAssets(),
    collectGroceryStoreAssets(),
    collectRestaurantMenuItemAssets(),
    collectCategoryAssets(),
    collectModelAssets(HeroBanner, {
      scope: 'banner',
      category: 'hero-banner',
      sourceModel: 'HeroBanner',
      select: { platform: 1, imageUrl: 1, cloudinaryPublicId: 1, order: 1, isActive: 1, linkedRestaurants: 1, zoneIds: 1 },
      imageResolver: (doc) => ({ url: doc.imageUrl, publicId: doc.cloudinaryPublicId }),
      ownerKeyResolver: (doc) => `hero-banner-${doc.order ?? 0}`,
      extraResolver: (doc) => ({
        order: doc.order ?? 0,
        isActive: !!doc.isActive,
        linkedRestaurants: Array.isArray(doc.linkedRestaurants) ? doc.linkedRestaurants.map(String) : [],
        zoneIds: Array.isArray(doc.zoneIds) ? doc.zoneIds.map(String) : [],
      }),
    }),
    collectModelAssets(Under250Banner, {
      scope: 'banner',
      category: 'under-250-banner',
      sourceModel: 'Under250Banner',
      select: { platform: 1, imageUrl: 1, cloudinaryPublicId: 1, order: 1, isActive: 1 },
      imageResolver: (doc) => ({ url: doc.imageUrl, publicId: doc.cloudinaryPublicId }),
      ownerKeyResolver: (doc) => `under-250-${doc.order ?? 0}`,
      extraResolver: (doc) => ({
        order: doc.order ?? 0,
        isActive: !!doc.isActive,
      }),
    }),
    collectModelAssets(DiningBanner, {
      scope: 'banner',
      category: 'dining-banner',
      sourceModel: 'DiningBanner',
      select: { imageUrl: 1, cloudinaryPublicId: 1, order: 1, isActive: 1 },
      platformResolver: () => 'mofood',
      imageResolver: (doc) => ({ url: doc.imageUrl, publicId: doc.cloudinaryPublicId }),
      ownerKeyResolver: (doc) => `dining-${doc.order ?? 0}`,
      extraResolver: (doc) => ({
        order: doc.order ?? 0,
        isActive: !!doc.isActive,
      }),
    }),
    collectModelAssets(LandingPageCategory, {
      scope: 'banner',
      category: 'landing-page-category',
      sourceModel: 'LandingPageCategory',
      select: { platform: 1, label: 1, slug: 1, imageUrl: 1, cloudinaryPublicId: 1, order: 1, isActive: 1 },
      imageResolver: (doc) => ({ url: doc.imageUrl, publicId: doc.cloudinaryPublicId }),
      ownerKeyResolver: (doc) => doc.slug || doc.label || String(doc._id),
      ownerLabelResolver: (doc) => doc.label || null,
      extraResolver: (doc) => ({
        label: doc.label || null,
        slug: doc.slug || null,
        order: doc.order ?? 0,
        isActive: !!doc.isActive,
      }),
    }),
    collectModelAssets(LandingPageExploreMore, {
      scope: 'banner',
      category: 'landing-page-explore-more',
      sourceModel: 'LandingPageExploreMore',
      select: { platform: 1, label: 1, link: 1, imageUrl: 1, cloudinaryPublicId: 1, order: 1, isActive: 1 },
      imageResolver: (doc) => ({ url: doc.imageUrl, publicId: doc.cloudinaryPublicId }),
      ownerKeyResolver: (doc) => doc.label || String(doc._id),
      ownerLabelResolver: (doc) => doc.label || null,
      extraResolver: (doc) => ({
        label: doc.label || null,
        link: doc.link || null,
        order: doc.order ?? 0,
        isActive: !!doc.isActive,
      }),
    }),
    collectModelAssets(MofoodProductSectionItem, {
      scope: 'restaurant',
      category: 'section-menu-item',
      sourceModel: 'MofoodProductSectionItem',
      select: { platform: 1, sectionName: 1, sectionOrder: 1, restaurantId: 1, menuItemId: 1, menuItemName: 1, menuItemImage: 1, menuItemPrice: 1, menuItemOriginalPrice: 1, order: 1, isActive: 1 },
      imageResolver: (doc) => doc.menuItemImage,
      ownerKeyResolver: (doc) => `${doc.sectionName || 'section'}-${doc.menuItemId || doc._id}`,
      ownerLabelResolver: (doc) => doc.menuItemName || null,
      extraResolver: (doc) => ({
        sectionName: doc.sectionName || null,
        sectionOrder: doc.sectionOrder ?? 0,
        restaurantId: doc.restaurantId ? String(doc.restaurantId) : null,
        menuItemId: doc.menuItemId || null,
        menuItemName: doc.menuItemName || null,
        menuItemPrice: doc.menuItemPrice ?? null,
        menuItemOriginalPrice: doc.menuItemOriginalPrice ?? null,
        order: doc.order ?? 0,
        isActive: !!doc.isActive,
      }),
    }),
  ]);

  return dedupeRecords([
    ...restaurantAssets,
    ...groceryStoreAssets,
    ...restaurantMenuItemAssets,
    ...categoryAssets,
    ...heroBanners,
    ...under250Banners,
    ...diningBanners,
    ...landingCategories,
    ...landingExploreMore,
    ...mofoodProductSectionItems,
  ]);
}

function buildSummary(records) {
  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir: OUTPUT_DIR,
    totalAssets: records.length,
    byCategory: {},
    byPlatform: {},
    bySourceModel: {},
    excluded: [
      'Order.billImageUrl',
      'Restaurant.onboarding.step3.pan.image',
      'Restaurant.onboarding.step3.gst.image',
      'Restaurant.onboarding.step3.fssai.image',
    ],
  };

  for (const record of records) {
    summary.byCategory[record.category] = (summary.byCategory[record.category] || 0) + 1;
    summary.byPlatform[record.platform] = (summary.byPlatform[record.platform] || 0) + 1;
    summary.bySourceModel[record.sourceModel] = (summary.bySourceModel[record.sourceModel] || 0) + 1;
  }

  return summary;
}

async function run() {
  ensureDir(OUTPUT_DIR);

  try {
    await connectDB();
    await initializeCloudinary();

    console.log(`Connected. Exporting restaurant-facing Cloudinary assets to: ${OUTPUT_DIR}`);

    const collected = await collectAssets();
    console.log(`Collected ${collected.length} unique asset references from MongoDB.`);

    const enriched = await enrichCloudinaryMetadata(collected);

    const downloaded = [];
    const failed = [];

    for (let index = 0; index < enriched.length; index += 1) {
      const record = enriched[index];
      try {
        const saved = await downloadAsset(record, index);
        downloaded.push(saved);
        console.log(`[${index + 1}/${enriched.length}] Downloaded ${saved.downloadedFile.relativePath}`);
      } catch (error) {
        const failure = {
          ...record,
          downloadError: error?.message || String(error),
        };
        failed.push(failure);
        console.error(`[${index + 1}/${enriched.length}] Failed ${record.url}: ${failure.downloadError}`);
      }
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      outputDir: OUTPUT_DIR,
      mongoConnection: mongoose.connection.host || null,
      totals: {
        discovered: collected.length,
        downloaded: downloaded.length,
        failed: failed.length,
      },
      exclusions: [
        {
          sourceField: 'Order.billImageUrl',
          reason: 'Explicitly excluded to avoid delivery partner bill images.',
        },
        {
          sourceField: 'Restaurant.onboarding.step3.*.image',
          reason: 'Excluded because these are KYC/compliance documents, not restaurant-facing media.',
        },
      ],
      assets: downloaded,
      failures: failed,
    };

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(buildSummary(downloaded), null, 2));

    console.log(`Manifest saved to ${MANIFEST_PATH}`);
    console.log(`Summary saved to ${SUMMARY_PATH}`);
    console.log(`Completed. Downloaded ${downloaded.length} assets with ${failed.length} failures.`);
    process.exit(failed.length > 0 ? 2 : 0);
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

run();
