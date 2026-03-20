import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import GroceryProduct from '../models/GroceryProduct.js';
import GroceryCategory from '../models/GroceryCategory.js';
import GrocerySubcategory from '../models/GrocerySubcategory.js';
import GroceryCategoryRequest from '../models/GroceryCategoryRequest.js';
import GrocerySubcategoryRequest from '../models/GrocerySubcategoryRequest.js';
import mongoose from 'mongoose';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const normalizeSubcategoryIds = (subcategoryIds) => {
  if (!Array.isArray(subcategoryIds)) {
    return [];
  }
  const unique = new Set();
  subcategoryIds.forEach((id) => {
    if (mongoose.Types.ObjectId.isValid(id)) {
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
        inStock: variant?.inStock !== false,
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
    variants: [],
    mrp: Number(mrp),
    sellingPrice: Number(sellingPrice),
    unit: String(unit || '').trim(),
    stockQuantity: Number(stockQuantity) || 0,
    inStock: Boolean(inStock),
  };
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

const mapCreateProductError = (error) => {
  if (!error) return { status: 500, message: 'Failed to create product' };

  // Duplicate index (legacy slug_1 or scoped storeId+slug index)
  if (error.code === 11000) {
    const hasStoreScopedSlug =
      error?.keyPattern?.storeId && error?.keyPattern?.slug;
    const hasGlobalSlugOnly =
      !hasStoreScopedSlug && error?.keyPattern?.slug;

    if (hasStoreScopedSlug) {
      return { status: 409, message: 'Product with this name already exists in your store' };
    }

    if (hasGlobalSlugOnly) {
      return { status: 409, message: 'Product slug conflict detected. Please contact support to refresh legacy indexes.' };
    }

    return { status: 409, message: 'Product with this name already exists' };
  }

  if (error.name === 'ValidationError') {
    const firstError = Object.values(error.errors || {})[0];
    return {
      status: 400,
      message: firstError?.message || 'Invalid product data',
    };
  }

  if (error.name === 'CastError') {
    return { status: 400, message: `Invalid ${error.path}` };
  }

  return { status: 500, message: 'Failed to create product' };
};

const resolveStoreScopedIds = async (store) => {
  const primaryId = store?._id?.toString?.();
  if (!primaryId) return [];

  const scopedIds = new Set([primaryId]);

  const normalizedPhone = normalizePhoneNumber(store?.phone || '');
  const normalizedOwnerPhone = normalizePhoneNumber(store?.ownerPhone || '');
  const email = (store?.email || '').toLowerCase().trim();
  const ownerEmail = (store?.ownerEmail || '').toLowerCase().trim();

  const or = [];
  if (normalizedPhone) {
    or.push({ phone: normalizedPhone }, { ownerPhone: normalizedPhone }, { primaryContactNumber: normalizedPhone });
  }
  if (normalizedOwnerPhone) {
    or.push({ phone: normalizedOwnerPhone }, { ownerPhone: normalizedOwnerPhone }, { primaryContactNumber: normalizedOwnerPhone });
  }
  if (email) {
    or.push({ email }, { ownerEmail: email });
  }
  if (ownerEmail) {
    or.push({ email: ownerEmail }, { ownerEmail });
  }

  if (!or.length) {
    return [new mongoose.Types.ObjectId(primaryId)];
  }

  const aliases = await mongoose.model('GroceryStore')
    .find({ $or: or })
    .select('_id')
    .lean();

  aliases.forEach((alias) => {
    const aliasId = alias?._id?.toString?.();
    if (aliasId) scopedIds.add(aliasId);
  });

  return Array.from(scopedIds)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
};

/**
 * Get all grocery products (for store to view - only products added by this store)
 * GET /api/grocery/store/products
 */
export const getGroceryStoreProducts = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // From groceryStoreAuth middleware
    const { categoryId, subcategoryId, limit, activeOnly = 'false' } = req.query;
    const scopedStoreIds = await resolveStoreScopedIds(store);
    
    // Filter by storeId - only show products added by this store
    const filter = {
      storeId: { $in: scopedStoreIds }
    };

    if (activeOnly !== 'false') {
      filter.isActive = true;
    }

    if (categoryId) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return errorResponse(res, 400, 'Invalid categoryId');
      }
      filter.category = categoryId;
    }

    if (subcategoryId) {
      if (!mongoose.Types.ObjectId.isValid(subcategoryId)) {
        return errorResponse(res, 400, 'Invalid subcategoryId');
      }
      filter.$or = [{ subcategories: subcategoryId }, { subcategory: subcategoryId }];
    }

    const parsedLimit = parseInt(limit, 10);
    const query = GroceryProduct.find(filter)
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .sort({ order: 1, createdAt: -1 });

    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      query.limit(parsedLimit);
    }

    const products = await query.lean();

    return successResponse(res, 200, 'Products retrieved successfully', {
      products,
      count: products.length
    });
  } catch (error) {
    console.error('Error fetching grocery store products:', error);
    return errorResponse(res, 500, 'Failed to fetch products');
  }
});

/**
 * Get grocery product by ID (only if it belongs to this store)
 * GET /api/grocery/store/products/:id
 */
export const getGroceryStoreProductById = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // From groceryStoreAuth middleware
    const { id } = req.params;
    const scopedStoreIds = await resolveStoreScopedIds(store);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    const product = await GroceryProduct.findOne({
      _id: id,
      storeId: { $in: scopedStoreIds }
    })
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .lean();

    if (!product) {
      return errorResponse(res, 404, 'Product not found');
    }

    return successResponse(res, 200, 'Product retrieved successfully', { product });
  } catch (error) {
    console.error('Error fetching grocery store product:', error);
    return errorResponse(res, 500, 'Failed to fetch product');
  }
});

/**
 * Update grocery product stock status (store can only update stock, not product details)
 * PATCH /api/grocery/store/products/:id/stock
 */
export const updateGroceryStoreProductStock = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // From groceryStoreAuth middleware
    const { id } = req.params;
    const { inStock, stockQuantity } = req.body;
    const scopedStoreIds = await resolveStoreScopedIds(store);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    // Verify product belongs to this store
    const existingProduct = await GroceryProduct.findOne({
      _id: id,
      storeId: { $in: scopedStoreIds }
    }).lean();

    if (!existingProduct) {
      return errorResponse(res, 404, 'Product not found');
    }

    const update = {};
    if (inStock !== undefined) {
      update.inStock = Boolean(inStock);
    }
    if (stockQuantity !== undefined) {
      update.stockQuantity = Number(stockQuantity) || 0;
    }

    if (Object.keys(update).length === 0) {
      return errorResponse(res, 400, 'No valid fields to update');
    }

    const product = await GroceryProduct.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .lean();

    if (!product) {
      return errorResponse(res, 404, 'Product not found');
    }

    return successResponse(res, 200, 'Product stock updated successfully', { product });
  } catch (error) {
    console.error('Error updating grocery store product stock:', error);
    return errorResponse(res, 500, 'Failed to update product stock');
  }
});

/**
 * Create a new grocery product (for store).
 * Optional: requestedNewCategory { name }, requestedNewSubcategoryNames [ "name1", "name2" ].
 * Category/subcategory requests are created in the same call; duplicates (already pending) are skipped.
 * POST /api/grocery/store/products
 */
export const createGroceryStoreProduct = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // From groceryStoreAuth middleware
    const {
      category,
      subcategories = [],
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
      requestedNewCategory,
      requestedNewSubcategoryNames = [],
    } = req.body;

    const normalizedVariants = normalizeProductVariants(variants);

    if (!category || !name || (normalizedVariants.length === 0 && (mrp === undefined || sellingPrice === undefined))) {
      return errorResponse(res, 400, 'Category, name, and pricing or variants are required');
    }

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return errorResponse(res, 400, 'Invalid category id');
    }

    const categoryExists = await GroceryCategory.findById(category).lean();
    if (!categoryExists) {
      return errorResponse(res, 404, 'Category not found');
    }

    const normalizedSubcategories = normalizeSubcategoryIds(subcategories);
    if (normalizedSubcategories.length > 0) {
      const subcategoryCount = await GrocerySubcategory.countDocuments({
        _id: { $in: normalizedSubcategories },
        category,
      });
      if (subcategoryCount !== normalizedSubcategories.length) {
        return errorResponse(res, 400, 'One or more subcategories are invalid for this category');
      }
    }

    const baseSlug = slugify(slug || name);
    if (!baseSlug) {
      return errorResponse(res, 400, 'Product name must contain letters or numbers');
    }
    const normalizedSlug = await buildUniqueProductSlug({
      baseSlug,
      storeId: store._id,
    });

    const categoryRequestName = requestedNewCategory && typeof requestedNewCategory === 'object' && requestedNewCategory.name
      ? String(requestedNewCategory.name).trim()
      : (typeof requestedNewCategory === 'string' ? String(requestedNewCategory).trim() : '');
    const subNames = Array.isArray(requestedNewSubcategoryNames)
      ? requestedNewSubcategoryNames.map((n) => String(n).trim()).filter(Boolean)
      : [];

    const variantBackedFields = buildVariantBackedProductFields({
      variants: normalizedVariants,
      mrp,
      sellingPrice,
      unit,
      stockQuantity,
      inStock,
    });

    const product = await GroceryProduct.create({
      category,
      subcategories: normalizedSubcategories,
      subcategory: normalizedSubcategories[0] || null,
      name: name.trim(),
      slug: normalizedSlug,
      images: Array.isArray(images) ? images : [],
      description,
      ...variantBackedFields,
      isActive: Boolean(isActive),
      order: Number(order) || 0,
      storeId: store._id,
      approvalStatus: 'pending',
      requestedCategory: categoryRequestName
        ? { name: categoryRequestName, slug: slugify(categoryRequestName) }
        : { name: '', slug: '' },
      requestedSubcategories: subNames.map((nameValue) => ({
        name: nameValue,
        slug: slugify(nameValue),
      })),
    });

    const warnings = [];

    // Optional: create category request (skip if already pending)
    if (categoryRequestName) {
      try {
        const catSlug = slugify(categoryRequestName);
        const existingCatReq = await GroceryCategoryRequest.findOne({
          storeId: store._id,
          $or: [{ name: categoryRequestName }, { slug: catSlug }],
          approvalStatus: 'pending',
        }).lean();
        if (!existingCatReq) {
          await GroceryCategoryRequest.create({
            storeId: store._id,
            name: categoryRequestName,
            slug: catSlug,
            section: 'Grocery & Kitchen',
            order: 0,
            isActive: true,
            approvalStatus: 'pending',
          });
        }
      } catch (requestError) {
        console.error('Category request creation failed after product creation:', requestError);
        warnings.push('Category request could not be created');
      }
    }

    // Optional: create subcategory requests for this category (skip if already pending)
    for (const subName of subNames) {
      try {
        const subSlug = slugify(subName);
        const existingSubReq = await GrocerySubcategoryRequest.findOne({
          storeId: store._id,
          category,
          $or: [{ name: subName }, { slug: subSlug }],
          approvalStatus: 'pending',
        }).lean();
        if (!existingSubReq) {
          await GrocerySubcategoryRequest.create({
            storeId: store._id,
            category,
            name: subName,
            slug: subSlug,
            order: 0,
            isActive: true,
            approvalStatus: 'pending',
          });
        }
      } catch (requestError) {
        console.error('Subcategory request creation failed after product creation:', requestError);
        warnings.push(`Subcategory request "${subName}" could not be created`);
      }
    }

    const populatedProduct = await GroceryProduct.findById(product._id)
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .lean();

    return successResponse(res, 201, 'Product created successfully', {
      product: populatedProduct,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (error) {
    console.error('Error creating grocery store product:', error);
    const { status, message } = mapCreateProductError(error);
    return errorResponse(res, status, message);
  }
});

/**
 * Update grocery product (store can update their own products)
 * PUT /api/grocery/store/products/:id
 */
export const updateGroceryStoreProduct = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // From groceryStoreAuth middleware
    const { id } = req.params;
    const scopedStoreIds = await resolveStoreScopedIds(store);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    // Verify product belongs to this store
    const existingProduct = await GroceryProduct.findOne({
      _id: id,
      storeId: { $in: scopedStoreIds }
    }).lean();

    if (!existingProduct) {
      return errorResponse(res, 404, 'Product not found');
    }

    const update = { ...req.body };
    delete update.storeId; // Prevent changing storeId


    const categoryId = update.category || existingProduct.category?.toString();
    if (update.category && !mongoose.Types.ObjectId.isValid(categoryId)) {
      return errorResponse(res, 400, 'Invalid category id');
    }

    if (update.slug || update.name) {
      update.slug = await buildUniqueProductSlug({
        baseSlug: slugify(update.slug || update.name || existingProduct.name),
        storeId: existingProduct.storeId?.toString?.() || store._id,
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
          return errorResponse(res, 400, 'One or more subcategories are invalid for this category');
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
    }

    const product = await GroceryProduct.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .lean();

    if (!product) {
      return errorResponse(res, 404, 'Product not found');
    }

    return successResponse(res, 200, 'Product updated successfully', { product });
  } catch (error) {
    console.error('Error updating grocery store product:', error);
    return errorResponse(res, 500, 'Failed to update product');
  }
});

/**
 * Delete grocery product (store can delete their own products)
 * DELETE /api/grocery/store/products/:id
 */
export const deleteGroceryStoreProduct = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // From groceryStoreAuth middleware
    const { id } = req.params;
    const scopedStoreIds = await resolveStoreScopedIds(store);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    // Verify product belongs to this store and delete
    const product = await GroceryProduct.findOneAndDelete({
      _id: id,
      storeId: { $in: scopedStoreIds }
    });

    if (!product) {
      return errorResponse(res, 404, 'Product not found');
    }

    return successResponse(res, 200, 'Product deleted successfully');
  } catch (error) {
    console.error('Error deleting grocery store product:', error);
    return errorResponse(res, 500, 'Failed to delete product');
  }
});
