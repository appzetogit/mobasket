import mongoose from 'mongoose';
import GroceryCategory from '../models/GroceryCategory.js';
import GrocerySubcategory from '../models/GrocerySubcategory.js';
import GroceryProduct from '../models/GroceryProduct.js';
import GroceryPlan from '../models/GroceryPlan.js';
import GroceryPlanOffer from '../models/GroceryPlanOffer.js';
import Order from '../../order/models/Order.js';
import Zone from '../../admin/models/Zone.js';
import GroceryStore from '../models/GroceryStore.js';

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const normalizeSubcategoryIds = (subcategoryIds) => {
  if (!Array.isArray(subcategoryIds)) {
    return [];
  }

  const unique = new Set();
  subcategoryIds.forEach((id) => {
    if (isValidObjectId(id)) {
      unique.add(id.toString());
    }
  });

  return Array.from(unique);
};

const normalizeProductVariants = (variants) => {
  if (!Array.isArray(variants)) {
    return [];
  }

  const normalized = variants
    .map((variant, index) => {
      const name = String(variant?.name || '').trim();
      const mrp = Number(variant?.mrp);
      const sellingPrice = Number(variant?.sellingPrice);
      const stockQuantity = Number(variant?.stockQuantity);
      const order = Number(variant?.order);

      if (!name || !Number.isFinite(mrp) || !Number.isFinite(sellingPrice)) {
        return null;
      }

      return {
        name,
        mrp: Math.max(0, mrp),
        sellingPrice: Math.max(0, sellingPrice),
        stockQuantity: Number.isFinite(stockQuantity) ? Math.max(0, stockQuantity) : 0,
        inStock: (variant?.inStock !== false) && (Number.isFinite(stockQuantity) ? Math.max(0, stockQuantity) : 0) > 0,
        isDefault: variant?.isDefault === true,
        order: Number.isFinite(order) ? order : index,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  const defaultIndex = normalized.findIndex((variant) => variant.isDefault);
  const resolvedDefaultIndex = defaultIndex >= 0 ? defaultIndex : 0;

  return normalized.map((variant, index) => ({
    ...variant,
    isDefault: index === resolvedDefaultIndex,
  }));
};

const normalizeStockState = (stockQuantity, inStock) => {
  const normalizedStockQuantity = Number.isFinite(Number(stockQuantity))
    ? Math.max(0, Number(stockQuantity))
    : 0;
  return {
    stockQuantity: normalizedStockQuantity,
    inStock: normalizedStockQuantity > 0 ? Boolean(inStock) : false,
  };
};

const buildVariantBackedProductFields = ({
  variants,
  mrp,
  sellingPrice,
  unit = '',
  stockQuantity = 0,
  inStock = true,
}) => {
  const normalizedVariants = normalizeProductVariants(variants);

  if (normalizedVariants.length > 0) {
    const defaultVariant = normalizedVariants.find((variant) => variant.isDefault) || normalizedVariants[0];
    return {
      variants: normalizedVariants,
      mrp: defaultVariant.mrp,
      sellingPrice: defaultVariant.sellingPrice,
      unit: defaultVariant.name,
      stockQuantity: defaultVariant.stockQuantity,
      inStock: defaultVariant.inStock,
    };
  }

  return {
    ...normalizeStockState(stockQuantity, inStock),
    variants: [],
    mrp: Number(mrp),
    sellingPrice: Number(sellingPrice),
    unit: String(unit || '').trim(),
  };
};

const normalizePlanProductImage = (item) => {
  if (!item || typeof item !== 'object') {
    return '';
  }

  if (Array.isArray(item.images)) {
    const fromImages = item.images
      .map((image) => {
        if (typeof image === 'string') return image.trim();
        return String(image?.url || image?.image || image?.imageUrl || image?.secure_url || '').trim();
      })
      .find(Boolean);
    if (fromImages) return fromImages;
  }

  if (typeof item.image === 'string' && item.image.trim()) {
    return item.image.trim();
  }

  if (item.image && typeof item.image === 'object') {
    const nestedImage = String(
      item.image.url ||
      item.image.image ||
      item.image.imageUrl ||
      item.image.secure_url ||
      ''
    ).trim();
    if (nestedImage) return nestedImage;
  }

  if (typeof item.thumbnail === 'string' && item.thumbnail.trim()) {
    return item.thumbnail.trim();
  }

  if (item.thumbnail && typeof item.thumbnail === 'object') {
    const nestedThumbnail = String(
      item.thumbnail.url ||
      item.thumbnail.image ||
      item.thumbnail.imageUrl ||
      item.thumbnail.secure_url ||
      ''
    ).trim();
    if (nestedThumbnail) return nestedThumbnail;
  }

  return '';
};

const normalizePlanProducts = (products) => {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .map((item) => {
      const name = (item?.name || '').toString().trim();
      const qty = (item?.qty || '').toString().trim();
      const rawProductId = item?.productId || item?._id || item?.id || null;
      const productId = isValidObjectId(rawProductId) ? rawProductId.toString() : undefined;
      const image = normalizePlanProductImage(item);

      return {
        ...(productId ? { productId } : {}),
        name,
        qty,
        ...(image ? { image } : {}),
      };
    })
    .filter((item) => item.name && item.qty);
};

const hydratePlanProductImages = async (plansOrPlan) => {
  const plans = Array.isArray(plansOrPlan) ? plansOrPlan.filter(Boolean) : [plansOrPlan].filter(Boolean);
  if (plans.length === 0) {
    return Array.isArray(plansOrPlan) ? [] : null;
  }

  const productIds = new Set();
  const productNames = new Set();

  plans.forEach((plan) => {
    ['products', 'vegProducts', 'nonVegProducts'].forEach((field) => {
      (Array.isArray(plan?.[field]) ? plan[field] : []).forEach((item) => {
        if (normalizePlanProductImage(item)) {
          return;
        }

        if (isValidObjectId(item?.productId)) {
          productIds.add(String(item.productId));
        }

        const productName = String(item?.name || '').trim();
        if (productName) {
          productNames.add(productName);
        }
      });
    });
  });

  if (productIds.size === 0 && productNames.size === 0) {
    return Array.isArray(plansOrPlan) ? plans : plans[0];
  }

  const productQuery = [];
  if (productIds.size > 0) {
    productQuery.push({
      _id: { $in: Array.from(productIds).map((id) => new mongoose.Types.ObjectId(id)) },
    });
  }
  if (productNames.size > 0) {
    productQuery.push({ name: { $in: Array.from(productNames) } });
  }

  const matchedProducts = productQuery.length > 0
    ? await GroceryProduct.find({ $or: productQuery }).select('name image images thumbnail').lean()
    : [];

  const productImageById = new Map();
  const productImageByName = new Map();
  matchedProducts.forEach((product) => {
    const productImage = normalizePlanProductImage(product);
    if (!productImage) return;

    productImageById.set(String(product._id), productImage);
    const nameKey = String(product?.name || '').trim().toLowerCase();
    if (nameKey && !productImageByName.has(nameKey)) {
      productImageByName.set(nameKey, productImage);
    }
  });

  const enrichItems = (items) =>
    (Array.isArray(items) ? items : []).map((item) => {
      const existingImage = normalizePlanProductImage(item);
      if (existingImage) {
        return { ...item, image: existingImage };
      }

      const productId = isValidObjectId(item?.productId) ? String(item.productId) : '';
      const nameKey = String(item?.name || '').trim().toLowerCase();
      const resolvedImage =
        (productId ? productImageById.get(productId) : '') ||
        (nameKey ? productImageByName.get(nameKey) : '') ||
        '';

      return resolvedImage ? { ...item, image: resolvedImage } : item;
    });

  const enrichedPlans = plans.map((plan) => ({
    ...plan,
    products: enrichItems(plan?.products),
    vegProducts: enrichItems(plan?.vegProducts),
    nonVegProducts: enrichItems(plan?.nonVegProducts),
  }));

  return Array.isArray(plansOrPlan) ? enrichedPlans : enrichedPlans[0];
};

const normalizeObjectIdArray = (values) => {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  values.forEach((value) => {
    if (isValidObjectId(value)) {
      unique.add(value.toString());
    }
  });
  return Array.from(unique);
};

const normalizePlanZoneIds = async (zoneIds) => {
  const normalizedZoneIds = normalizeObjectIdArray(zoneIds);
  if (normalizedZoneIds.length === 0) return [];

  const zones = await Zone.find({
    _id: { $in: normalizedZoneIds },
    platform: 'mogrocery',
  })
    .select('_id')
    .lean();

  return zones.map((zone) => zone._id.toString());
};

const normalizePlanZoneStoreRules = async (rules) => {
  if (!Array.isArray(rules)) return [];

  const normalized = rules
    .map((rule) => ({
      zoneId: isValidObjectId(rule?.zoneId) ? String(rule.zoneId) : '',
      storeId: isValidObjectId(rule?.storeId) ? String(rule.storeId) : '',
      subcategoryIds: normalizeObjectIdArray(rule?.subcategoryIds || []),
    }))
    .filter((rule) => rule.zoneId && rule.storeId);

  if (normalized.length === 0) return [];

  const zoneIds = Array.from(new Set(normalized.map((rule) => rule.zoneId)));
  const storeIds = Array.from(new Set(normalized.map((rule) => rule.storeId)));
  const subcategoryIds = Array.from(
    new Set(normalized.flatMap((rule) => rule.subcategoryIds))
  );

  const [zones, stores, subcategories] = await Promise.all([
    Zone.find({ _id: { $in: zoneIds }, platform: 'mogrocery' }).select('_id').lean(),
    GroceryStore.find({ _id: { $in: storeIds } }).select('_id zoneId').lean(),
    subcategoryIds.length > 0
      ? GrocerySubcategory.find({ _id: { $in: subcategoryIds } }).select('_id').lean()
      : Promise.resolve([]),
  ]);

  const validZoneSet = new Set(zones.map((zone) => String(zone._id)));
  const storeById = new Map(stores.map((store) => [String(store._id), store]));
  const validSubcategorySet = new Set(subcategories.map((subcategory) => String(subcategory._id)));

  const unique = new Set();
  const filtered = [];
  normalized.forEach((rule) => {
    if (!validZoneSet.has(rule.zoneId)) return;
    const store = storeById.get(rule.storeId);
    if (!store) return;
    if (store?.zoneId && String(store.zoneId) !== rule.zoneId) return;

    const dedupedSubcategoryIds = Array.from(
      new Set(rule.subcategoryIds.filter((subcategoryId) => validSubcategorySet.has(subcategoryId)))
    );

    const uniqueKey = `${rule.zoneId}:${rule.storeId}`;
    if (unique.has(uniqueKey)) return;
    unique.add(uniqueKey);

    filtered.push({
      zoneId: rule.zoneId,
      storeId: rule.storeId,
      subcategoryIds: dedupedSubcategoryIds,
    });
  });

  return filtered;
};

const normalizePercentage = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
};

const buildUniqueProductSlug = async ({ baseSlug, storeId, excludeId = null }) => {
  const safeBaseSlug = String(baseSlug || '').trim() || `product-${Date.now()}`;
  let candidateSlug = safeBaseSlug;
  let counter = 2;

  while (true) {
    const duplicate = await GroceryProduct.exists({
      slug: candidateSlug,
      storeId,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });

    if (!duplicate) {
      return candidateSlug;
    }

    candidateSlug = `${safeBaseSlug}-${counter}`;
    counter += 1;
  }
};

const isPointInZone = (lat, lng, zoneCoordinates = []) => {
  if (!Array.isArray(zoneCoordinates) || zoneCoordinates.length < 3) return false;
  let inside = false;

  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const xi = zoneCoordinates[i]?.longitude;
    const yi = zoneCoordinates[i]?.latitude;
    const xj = zoneCoordinates[j]?.longitude;
    const yj = zoneCoordinates[j]?.latitude;

    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
};

const resolveStoreZoneId = (store, activeZones = []) => {
  const explicitZoneId = String(
    store?.zoneId?._id ||
    store?.zoneId?.id ||
    store?.zoneId ||
    ''
  ).trim();
  if (explicitZoneId) {
    const explicitZone = activeZones.find((zone) => String(zone?._id || '') === explicitZoneId);
    if (explicitZone?._id) return String(explicitZone._id);
  }

  const storeIdCandidates = new Set([
    String(store?._id || '').trim(),
    String(store?.restaurantId || '').trim()
  ].filter(Boolean));
  const linkedZone = activeZones.find((zone) => {
    const linkedRestaurantId = String(zone?.restaurantId?._id || zone?.restaurantId || '').trim();
    return linkedRestaurantId && storeIdCandidates.has(linkedRestaurantId);
  });
  if (linkedZone?._id) return String(linkedZone._id);

  const lat = Number(store?.location?.latitude ?? store?.location?.coordinates?.[1]);
  const lng = Number(store?.location?.longitude ?? store?.location?.coordinates?.[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const containingZone = activeZones.find((zone) => isPointInZone(lat, lng, zone.coordinates));
  return containingZone?._id ? containingZone._id.toString() : null;
};

export const getCategories = async (req, res) => {
  try {
    const { section, includeSubcategories, activeOnly = 'true' } = req.query;
    const filter = {};

    if (activeOnly !== 'false') {
      filter.isActive = true;
    }

    if (section) {
      filter.section = section;
    }

    const categories = await GroceryCategory.find(filter).sort({ section: 1, order: 1, name: 1 }).lean();

    if (includeSubcategories !== 'true') {
      return res.status(200).json({
        success: true,
        count: categories.length,
        data: categories,
      });
    }

    const categoryIds = categories.map((category) => category._id);
    const subcategories = await GrocerySubcategory.find({
      category: { $in: categoryIds },
      isActive: true,
    })
      .sort({ order: 1, name: 1 })
      .lean();

    const subcategoriesByCategoryId = new Map();
    subcategories.forEach((subcategory) => {
      const categoryId = subcategory.category.toString();
      if (!subcategoriesByCategoryId.has(categoryId)) {
        subcategoriesByCategoryId.set(categoryId, []);
      }
      subcategoriesByCategoryId.get(categoryId).push(subcategory);
    });

    const categoriesWithSubcategories = categories.map((category) => ({
      ...category,
      subcategories: subcategoriesByCategoryId.get(category._id.toString()) || [],
    }));

    return res.status(200).json({
      success: true,
      count: categoriesWithSubcategories.length,
      data: categoriesWithSubcategories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch grocery categories',
      error: error.message,
    });
  }
};

export const getSubcategories = async (req, res) => {
  try {
    const { categoryId, activeOnly = 'true' } = req.query;
    const filter = {};

    if (activeOnly !== 'false') {
      filter.isActive = true;
    }

    if (categoryId) {
      if (!isValidObjectId(categoryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid categoryId',
        });
      }
      filter.category = categoryId;
    }

    const subcategories = await GrocerySubcategory.find(filter)
      .populate('category', 'name slug section')
      .sort({ order: 1, name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: subcategories.length,
      data: subcategories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch grocery subcategories',
      error: error.message,
    });
  }
};

export const getProducts = async (req, res) => {
  try {
    const { categoryId, subcategoryId, limit, activeOnly = 'true', zoneId, storeId } = req.query;
    const filter = {
      approvalStatus: 'approved', // Only show approved products on public /grocery page
    };

    let userZone = null;
    if (zoneId) {
      if (!isValidObjectId(zoneId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid zoneId',
        });
      }
      userZone = await Zone.findOne({ _id: zoneId, isActive: true, platform: 'mogrocery' }).lean();
      if (!userZone) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or inactive grocery zone. Please detect your zone again.',
        });
      }
    }

    const activeGroceryZones = await Zone.find({ isActive: true, platform: 'mogrocery' })
      .select('_id coordinates restaurantId')
      .lean();

    if (activeOnly !== 'false') {
      filter.isActive = true;
    }

    if (categoryId) {
      if (!isValidObjectId(categoryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid categoryId',
        });
      }
      filter.category = categoryId;
    }

    if (subcategoryId) {
      if (!isValidObjectId(subcategoryId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subcategoryId',
        });
      }
      filter.$or = [{ subcategories: subcategoryId }, { subcategory: subcategoryId }];
    }

    if (storeId) {
      if (!isValidObjectId(storeId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid storeId',
        });
      }
      filter.storeId = storeId;
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const query = GroceryProduct.find(filter)
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('storeId', 'name location address platform isActive zoneId restaurantId')
      .sort({ order: 1, createdAt: -1 });

    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      query.limit(parsedLimit);
    }

    let products = await query.lean();

    const userZoneId = userZone?._id ? userZone._id.toString() : null;
    products = products.filter((product) => {
      const store = product?.storeId;
      if (!store || typeof store !== 'object') return false;
      if (store?.isActive === false) return false;

      // Only enforce strict zone match when client sends a resolved user zone.
      // Without a zone hint, do not hide approved products.
      if (userZoneId) {
        const storeZoneId = resolveStoreZoneId(store, activeGroceryZones);
        if (!storeZoneId) return false;
        if (storeZoneId !== userZoneId) return false;
      }
      return true;
    });

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch grocery products',
      error: error.message,
    });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const category = await GroceryCategory.findById(id).lean();
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch category', error: error.message });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, slug, image = '', description = '', section = 'Grocery & Kitchen', order = 0, isActive = true } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const normalizedSlug = slugify(slug || name);
    const existing = await GroceryCategory.findOne({ slug: normalizedSlug }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Category slug already exists' });
    }

    const category = await GroceryCategory.create({
      name: name.trim(),
      slug: normalizedSlug,
      image,
      description,
      section,
      order: Number(order) || 0,
      isActive: Boolean(isActive),
    });

    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create category', error: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const update = { ...req.body };
    if (update.slug || update.name) {
      update.slug = slugify(update.slug || update.name);
      const existing = await GroceryCategory.findOne({ slug: update.slug, _id: { $ne: id } }).lean();
      if (existing) {
        return res.status(409).json({ success: false, message: 'Category slug already exists' });
      }
    }

    const category = await GroceryCategory.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update category', error: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const [subcategoryCount, productCount] = await Promise.all([
      GrocerySubcategory.countDocuments({ category: id }),
      GroceryProduct.countDocuments({ category: id }),
    ]);

    if (subcategoryCount > 0 || productCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with linked subcategories or products',
      });
    }

    const category = await GroceryCategory.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    return res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete category', error: error.message });
  }
};

export const getSubcategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid subcategory id' });
    }

    const subcategory = await GrocerySubcategory.findById(id).populate('category', 'name slug').lean();
    if (!subcategory) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    return res.status(200).json({ success: true, data: subcategory });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch subcategory', error: error.message });
  }
};

export const createSubcategory = async (req, res) => {
  try {
    const { category, name, slug, image = '', description = '', order = 0, isActive = true } = req.body;
    if (!category || !name) {
      return res.status(400).json({ success: false, message: 'Category and name are required' });
    }
    if (!isValidObjectId(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const categoryExists = await GroceryCategory.findById(category).lean();
    if (!categoryExists) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const normalizedSlug = slugify(slug || name);
    const existing = await GrocerySubcategory.findOne({ category, slug: normalizedSlug }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Subcategory slug already exists in this category' });
    }

    const subcategory = await GrocerySubcategory.create({
      category,
      name: name.trim(),
      slug: normalizedSlug,
      image,
      description,
      order: Number(order) || 0,
      isActive: Boolean(isActive),
    });

    return res.status(201).json({ success: true, data: subcategory });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create subcategory', error: error.message });
  }
};

export const updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid subcategory id' });
    }

    const existingSubcategory = await GrocerySubcategory.findById(id).lean();
    if (!existingSubcategory) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    const update = { ...req.body };
    const categoryId = update.category || existingSubcategory.category?.toString();
    if (!isValidObjectId(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    if (update.slug || update.name) {
      update.slug = slugify(update.slug || update.name || existingSubcategory.name);
      const duplicate = await GrocerySubcategory.findOne({
        category: categoryId,
        slug: update.slug,
        _id: { $ne: id },
      }).lean();
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Subcategory slug already exists in this category' });
      }
    }

    const subcategory = await GrocerySubcategory.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return res.status(200).json({ success: true, data: subcategory });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update subcategory', error: error.message });
  }
};

export const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid subcategory id' });
    }

    const linkedProducts = await GroceryProduct.countDocuments({
      $or: [{ subcategories: id }, { subcategory: id }],
    });
    if (linkedProducts > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete subcategory linked to products',
      });
    }

    const subcategory = await GrocerySubcategory.findByIdAndDelete(id);
    if (!subcategory) {
      return res.status(404).json({ success: false, message: 'Subcategory not found' });
    }

    return res.status(200).json({ success: true, message: 'Subcategory deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete subcategory', error: error.message });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const { zoneId } = req.query;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    let userZone = null;
    if (zoneId) {
      if (!isValidObjectId(zoneId)) {
        return res.status(400).json({ success: false, message: 'Invalid zoneId' });
      }
      userZone = await Zone.findOne({ _id: zoneId, isActive: true, platform: 'mogrocery' }).lean();
      if (!userZone) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive grocery zone. Please detect your zone again.' });
      }
    }

    const product = await GroceryProduct.findById(id)
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('storeId', 'name location address platform isActive zoneId restaurantId')
      .lean();

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const activeGroceryZones = await Zone.find({ isActive: true, platform: 'mogrocery' })
      .select('_id coordinates restaurantId')
      .lean();

    if (!product?.storeId || product.storeId.isActive === false) {
      return res.status(404).json({ success: false, message: 'Product not available in active stores' });
    }

    const userZoneId = userZone?._id ? userZone._id.toString() : null;
    if (userZoneId) {
      const storeZoneId = resolveStoreZoneId(product?.storeId, activeGroceryZones);
      if (!storeZoneId) {
        return res.status(404).json({ success: false, message: 'Product not available in service zones' });
      }
      if (storeZoneId !== userZoneId) {
        return res.status(403).json({ success: false, message: 'This product is not available in your zone' });
      }
    }

    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product', error: error.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      category,
      subcategories = [],
      storeIds = [],
      storeId,
      name,
      slug,
      images = [],
      description = '',
      mrp,
      sellingPrice,
      unit = '',
      variants = [],
      isActive = true,
      inStock = true,
      stockQuantity = 0,
      order = 0,
    } = req.body;

    const normalizedVariants = normalizeProductVariants(variants);

    if (!category || !name || (normalizedVariants.length === 0 && (mrp === undefined || sellingPrice === undefined))) {
      return res.status(400).json({
        success: false,
        message: 'Category, name, and pricing or variants are required',
      });
    }

    if (!isValidObjectId(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const categoryExists = await GroceryCategory.findById(category).lean();
    if (!categoryExists) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const normalizedSubcategories = normalizeSubcategoryIds(subcategories);
    if (normalizedSubcategories.length > 0) {
      const subcategoryCount = await GrocerySubcategory.countDocuments({
        _id: { $in: normalizedSubcategories },
        category,
      });
      if (subcategoryCount !== normalizedSubcategories.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more subcategories are invalid for this category',
        });
      }
    }

    const normalizedStoreIds = normalizeObjectIdArray([
      ...(Array.isArray(storeIds) ? storeIds : []),
      storeId,
    ]);
    if (normalizedStoreIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one grocery store is required' });
    }

    const stores = await GroceryStore.find({
      _id: { $in: normalizedStoreIds },
    })
      .select('_id')
      .lean();
    if (stores.length !== normalizedStoreIds.length) {
      return res.status(400).json({ success: false, message: 'One or more grocery stores are invalid' });
    }

    const baseSlug = slugify(slug || name);
    const docs = await Promise.all(normalizedStoreIds.map(async (targetStoreId) => {
      const variantBackedFields = buildVariantBackedProductFields({
        variants: normalizedVariants,
        mrp,
        sellingPrice,
        unit,
        stockQuantity,
        inStock,
      });

      return {
        slug: await buildUniqueProductSlug({
          baseSlug,
          storeId: targetStoreId,
        }),
        category,
        subcategories: normalizedSubcategories,
        // keep first value in legacy field for old consumers
        subcategory: normalizedSubcategories[0] || null,
        name: name.trim(),
        images: Array.isArray(images) ? images : [],
        description,
        ...variantBackedFields,
        isActive: Boolean(isActive),
        order: Number(order) || 0,
        storeId: targetStoreId,
        approvalStatus: 'approved',
        rejectionReason: '',
      };
    }));

    const products = await GroceryProduct.insertMany(docs, { ordered: true });
    const responseData = products.length === 1 ? products[0] : products;
    return res.status(201).json({ success: true, count: products.length, data: responseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create product', error: error.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const existingProduct = await GroceryProduct.findById(id).lean();
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const update = { ...req.body };
    const categoryId = update.category || existingProduct.category?.toString();
    if (!isValidObjectId(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const targetStoreId = update.storeId || existingProduct.storeId?.toString();
    if (!targetStoreId || !isValidObjectId(targetStoreId)) {
      return res.status(400).json({ success: false, message: 'Valid grocery store is required' });
    }
    if (update.storeId) {
      const storeExists = await GroceryStore.exists({ _id: targetStoreId });
      if (!storeExists) {
        return res.status(400).json({ success: false, message: 'Invalid grocery store' });
      }
    }

    if (update.slug || update.name) {
      update.slug = await buildUniqueProductSlug({
        baseSlug: slugify(update.slug || update.name || existingProduct.name),
        storeId: targetStoreId,
        excludeId: id,
      });
    }

    if (update.subcategories !== undefined) {
      const normalizedSubcategories = normalizeSubcategoryIds(update.subcategories);
      if (normalizedSubcategories.length > 0) {
        const subcategoryCount = await GrocerySubcategory.countDocuments({
          _id: { $in: normalizedSubcategories },
          category: categoryId,
        });
        if (subcategoryCount !== normalizedSubcategories.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more subcategories are invalid for this category',
          });
        }
      }

      update.subcategories = normalizedSubcategories;
      update.subcategory = normalizedSubcategories[0] || null;
    }

    if (update.variants !== undefined) {
      const variantBackedFields = buildVariantBackedProductFields({
        variants: update.variants,
        mrp: update.mrp ?? existingProduct.mrp,
        sellingPrice: update.sellingPrice ?? existingProduct.sellingPrice,
        unit: update.unit ?? existingProduct.unit,
        stockQuantity: update.stockQuantity ?? existingProduct.stockQuantity,
        inStock: update.inStock ?? existingProduct.inStock,
      });

      update.variants = variantBackedFields.variants;
      update.mrp = variantBackedFields.mrp;
      update.sellingPrice = variantBackedFields.sellingPrice;
      update.unit = variantBackedFields.unit;
      update.stockQuantity = variantBackedFields.stockQuantity;
      update.inStock = variantBackedFields.inStock;
    } else if (update.stockQuantity !== undefined || update.inStock !== undefined) {
      const normalizedStockState = normalizeStockState(
        update.stockQuantity ?? existingProduct.stockQuantity,
        update.inStock ?? existingProduct.inStock,
      );
      update.stockQuantity = normalizedStockState.stockQuantity;
      update.inStock = normalizedStockState.inStock;
    }

    const product = await GroceryProduct.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const product = await GroceryProduct.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
};

export const getPlans = async (req, res) => {
  try {
    const { activeOnly = 'true', zoneId } = req.query;
    const filter = {};
    if (activeOnly !== 'false') {
      filter.isActive = true;
    }
    if (zoneId !== undefined && zoneId !== null && String(zoneId).trim() !== '') {
      if (!isValidObjectId(zoneId)) {
        return res.status(400).json({ success: false, message: 'Invalid zoneId' });
      }
      filter.$or = [
        { zoneIds: new mongoose.Types.ObjectId(zoneId) },
        { zoneIds: { $size: 0 } },
      ];
    }

    const plans = await GroceryPlan.find(filter)
      .populate('offerIds', 'name discountType discountValue freeDelivery isActive')
      .populate('zoneIds', 'name zoneName serviceLocation isActive platform')
      .populate('zoneStoreRules.zoneId', 'name zoneName serviceLocation isActive platform')
      .populate('zoneStoreRules.storeId', 'name ownerName zoneId isActive')
      .populate('zoneStoreRules.subcategoryIds', 'name slug isActive')
      .sort({ order: 1, createdAt: -1 })
      .lean();
    const enrichedPlans = await hydratePlanProductImages(plans);
    return res.status(200).json({
      success: true,
      count: enrichedPlans.length,
      data: enrichedPlans,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch grocery plans',
      error: error.message,
    });
  }
};

export const getPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plan id' });
    }

    const plan = await GroceryPlan.findById(id)
      .populate('offerIds', 'name discountType discountValue freeDelivery isActive')
      .populate('zoneIds', 'name zoneName serviceLocation isActive platform')
      .populate('zoneStoreRules.zoneId', 'name zoneName serviceLocation isActive platform')
      .populate('zoneStoreRules.storeId', 'name ownerName zoneId isActive')
      .populate('zoneStoreRules.subcategoryIds', 'name slug isActive')
      .lean();
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const enrichedPlan = await hydratePlanProductImages(plan);
    return res.status(200).json({ success: true, data: enrichedPlan });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch plan', error: error.message });
  }
};

export const createPlan = async (req, res) => {
  try {
    const {
      key,
      name,
      description = '',
      itemsLabel = '',
      productCount = 0,
      deliveries = 0,
      frequency = '',
      price,
      durationDays,
      iconKey = 'zap',
      color = 'bg-emerald-500',
      headerColor = 'bg-emerald-500',
      popular = false,
      benefits = [],
      products = [],
      vegProducts = [],
      nonVegProducts = [],
      offerIds = [],
      zoneIds = [],
      zoneStoreRules = [],
      order = 0,
      isActive = true,
    } = req.body;

    if (!name || price === undefined || durationDays === undefined) {
      return res.status(400).json({
        success: false,
        message: 'name, price and durationDays are required',
      });
    }

    const normalizedKey = slugify(key || name);
    const exists = await GroceryPlan.findOne({ key: normalizedKey }).lean();
    if (exists) {
      return res.status(409).json({ success: false, message: 'Plan key already exists' });
    }

    const normalizedProducts = normalizePlanProducts(products);
    const normalizedVegProducts = normalizePlanProducts(vegProducts);
    const normalizedNonVegProducts = normalizePlanProducts(nonVegProducts);
    const mergedProducts =
      normalizedProducts.length > 0 ? normalizedProducts : [...normalizedVegProducts, ...normalizedNonVegProducts];
    const normalizedOfferIds = normalizeObjectIdArray(offerIds);
    const normalizedZoneStoreRules = await normalizePlanZoneStoreRules(zoneStoreRules);
    const normalizedZoneIds = Array.from(
      new Set([
        ...(await normalizePlanZoneIds(zoneIds)),
        ...normalizedZoneStoreRules.map((rule) => String(rule.zoneId)),
      ])
    );

    const plan = await GroceryPlan.create({
      key: normalizedKey,
      name: name.trim(),
      description,
      itemsLabel,
      productCount: Number(productCount) || 0,
      deliveries: Number(deliveries) || 0,
      frequency,
      price: Number(price),
      durationDays: Number(durationDays),
      iconKey,
      color,
      headerColor,
      popular: Boolean(popular),
      benefits: Array.isArray(benefits) ? benefits.filter(Boolean) : [],
      products: mergedProducts,
      vegProducts: normalizedVegProducts,
      nonVegProducts: normalizedNonVegProducts,
      offerIds: normalizedOfferIds,
      zoneIds: normalizedZoneIds,
      zoneStoreRules: normalizedZoneStoreRules,
      order: Number(order) || 0,
      isActive: Boolean(isActive),
    });

    return res.status(201).json({ success: true, data: plan });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create plan', error: error.message });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plan id' });
    }

    const existing = await GroceryPlan.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const update = { ...req.body };
    if (update.key || update.name) {
      update.key = slugify(update.key || update.name || existing.name);
      const duplicate = await GroceryPlan.findOne({ key: update.key, _id: { $ne: id } }).lean();
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Plan key already exists' });
      }
    }

    if (update.price !== undefined) update.price = Number(update.price);
    if (update.durationDays !== undefined) update.durationDays = Number(update.durationDays);
    if (update.productCount !== undefined) update.productCount = Number(update.productCount) || 0;
    if (update.deliveries !== undefined) update.deliveries = Number(update.deliveries) || 0;
    if (update.order !== undefined) update.order = Number(update.order) || 0;
    if (update.products !== undefined) update.products = normalizePlanProducts(update.products);
    if (update.vegProducts !== undefined) update.vegProducts = normalizePlanProducts(update.vegProducts);
    if (update.nonVegProducts !== undefined) update.nonVegProducts = normalizePlanProducts(update.nonVegProducts);
    if (update.offerIds !== undefined) update.offerIds = normalizeObjectIdArray(update.offerIds);
    if (update.zoneIds !== undefined) update.zoneIds = await normalizePlanZoneIds(update.zoneIds);
    if (update.zoneStoreRules !== undefined) {
      update.zoneStoreRules = await normalizePlanZoneStoreRules(update.zoneStoreRules);
      const mergedZoneIds = Array.from(
        new Set([
          ...(Array.isArray(update.zoneIds) ? update.zoneIds : normalizeObjectIdArray(existing.zoneIds)),
          ...update.zoneStoreRules.map((rule) => String(rule.zoneId)),
        ])
      );
      update.zoneIds = await normalizePlanZoneIds(mergedZoneIds);
    }

    if (update.vegProducts !== undefined || update.nonVegProducts !== undefined) {
      const nextVegProducts = update.vegProducts ?? normalizePlanProducts(existing.vegProducts);
      const nextNonVegProducts = update.nonVegProducts ?? normalizePlanProducts(existing.nonVegProducts);

      if (update.products === undefined || update.products.length === 0) {
        update.products = [...nextVegProducts, ...nextNonVegProducts];
      }
    }

    const plan = await GroceryPlan.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return res.status(200).json({ success: true, data: plan });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update plan', error: error.message });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plan id' });
    }

    const plan = await GroceryPlan.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    return res.status(200).json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete plan', error: error.message });
  }
};

export const getPlanOffers = async (req, res) => {
  try {
    const { activeOnly = 'true', planId } = req.query;
    const filter = {};
    const now = new Date();

    if (activeOnly !== 'false') {
      filter.isActive = true;
      filter.$and = [
        { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
        { $or: [{ validTill: null }, { validTill: { $gte: now } }] },
      ];
    }

    if (planId && isValidObjectId(planId)) {
      const planObjectId = new mongoose.Types.ObjectId(planId);
      const planDoc = await GroceryPlan.findById(planId).select('offerIds').lean();
      const linkedOfferIds = normalizeObjectIdArray(planDoc?.offerIds || []);

      if (linkedOfferIds.length > 0) {
        filter.$or = [
          { planIds: planObjectId },
          { _id: { $in: linkedOfferIds } },
        ];
      } else {
        filter.planIds = planObjectId;
      }
    }

    const offers = await GroceryPlanOffer.find(filter)
      .populate('planIds', 'name')
      .populate('productIds', 'name images unit')
      .populate('categoryIds', 'name')
      .populate('subcategoryIds', 'name')
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch plan offers',
      error: error.message,
    });
  }
};

export const getPlanOfferById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid offer id' });
    }

    const offer = await GroceryPlanOffer.findById(id)
      .populate('planIds', 'name')
      .populate('productIds', 'name images unit')
      .populate('categoryIds', 'name')
      .populate('subcategoryIds', 'name')
      .lean();
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    return res.status(200).json({ success: true, data: offer });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch offer', error: error.message });
  }
};

export const createPlanOffer = async (req, res) => {
  try {
    const {
      key,
      name,
      description = '',
      discountType = 'none',
      discountValue = 0,
      categoryDiscountPercentage = 0,
      subcategoryDiscountPercentage = 0,
      productDiscountPercentage = 0,
      freeDelivery = false,
      planIds = [],
      productIds = [],
      categoryIds = [],
      subcategoryIds = [],
      validFrom = null,
      validTill = null,
      order = 0,
      isActive = true,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const normalizedKey = slugify(key || name);
    const exists = await GroceryPlanOffer.findOne({ key: normalizedKey }).lean();
    if (exists) {
      return res.status(409).json({ success: false, message: 'Offer key already exists' });
    }

    const offer = await GroceryPlanOffer.create({
      key: normalizedKey,
      name: name.trim(),
      description: description.toString().trim(),
      discountType,
      discountValue: Number(discountValue) || 0,
      categoryDiscountPercentage: normalizePercentage(categoryDiscountPercentage),
      subcategoryDiscountPercentage: normalizePercentage(subcategoryDiscountPercentage),
      productDiscountPercentage: normalizePercentage(productDiscountPercentage),
      freeDelivery: Boolean(freeDelivery),
      planIds: normalizeObjectIdArray(planIds),
      productIds: normalizeObjectIdArray(productIds),
      categoryIds: normalizeObjectIdArray(categoryIds),
      subcategoryIds: normalizeObjectIdArray(subcategoryIds),
      validFrom: validFrom ? new Date(validFrom) : null,
      validTill: validTill ? new Date(validTill) : null,
      order: Number(order) || 0,
      isActive: Boolean(isActive),
    });

    return res.status(201).json({ success: true, data: offer });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create offer', error: error.message });
  }
};

export const updatePlanOffer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid offer id' });
    }

    const existing = await GroceryPlanOffer.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    const update = { ...req.body };
    if (update.key || update.name) {
      update.key = slugify(update.key || update.name || existing.name);
      const duplicate = await GroceryPlanOffer.findOne({ key: update.key, _id: { $ne: id } }).lean();
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Offer key already exists' });
      }
    }

    if (update.discountValue !== undefined) update.discountValue = Number(update.discountValue) || 0;
    if (update.categoryDiscountPercentage !== undefined) {
      update.categoryDiscountPercentage = normalizePercentage(update.categoryDiscountPercentage);
    }
    if (update.subcategoryDiscountPercentage !== undefined) {
      update.subcategoryDiscountPercentage = normalizePercentage(update.subcategoryDiscountPercentage);
    }
    if (update.productDiscountPercentage !== undefined) {
      update.productDiscountPercentage = normalizePercentage(update.productDiscountPercentage);
    }
    if (update.order !== undefined) update.order = Number(update.order) || 0;
    if (update.planIds !== undefined) update.planIds = normalizeObjectIdArray(update.planIds);
    if (update.productIds !== undefined) update.productIds = normalizeObjectIdArray(update.productIds);
    if (update.categoryIds !== undefined) update.categoryIds = normalizeObjectIdArray(update.categoryIds);
    if (update.subcategoryIds !== undefined) update.subcategoryIds = normalizeObjectIdArray(update.subcategoryIds);
    if (update.validFrom !== undefined) update.validFrom = update.validFrom ? new Date(update.validFrom) : null;
    if (update.validTill !== undefined) update.validTill = update.validTill ? new Date(update.validTill) : null;

    const offer = await GroceryPlanOffer.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return res.status(200).json({ success: true, data: offer });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update offer', error: error.message });
  }
};

export const deletePlanOffer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid offer id' });
    }

    const offer = await GroceryPlanOffer.findByIdAndDelete(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    return res.status(200).json({ success: true, message: 'Offer deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete offer', error: error.message });
  }
};

export const getPlanSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {
      $or: [
        { 'planSubscription.planId': { $exists: true, $ne: null } },
        { note: { $regex: /\[MoGold Plan\]/i } },
      ],
    };

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('userId', 'name phone email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    const data = orders.map((order) => ({
      id: order._id?.toString(),
      orderId: order.orderId,
      planId: order.planSubscription?.planId || null,
      planName: order.planSubscription?.planName || '',
      durationDays: Number(order.planSubscription?.durationDays || 0),
      amount: Number(order.pricing?.total || 0),
      status: order.status,
      paymentStatus: order.payment?.status || 'pending',
      paymentMethod: order.payment?.method || '',
      user: {
        id: order.userId?._id?.toString() || null,
        name: order.userId?.name || '',
        phone: order.userId?.phone || '',
        email: order.userId?.email || '',
      },
      createdAt: order.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch plan subscriptions',
      error: error.message,
    });
  }
};
