import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import GroceryProduct from '../../grocery/models/GroceryProduct.js';
import GroceryCategory from '../../grocery/models/GroceryCategory.js';
import GrocerySubcategory from '../../grocery/models/GrocerySubcategory.js';
import GroceryCategoryRequest from '../../grocery/models/GroceryCategoryRequest.js';
import GrocerySubcategoryRequest from '../../grocery/models/GrocerySubcategoryRequest.js';
import mongoose from 'mongoose';

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const getValidObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null);
const isInlineBase64Image = (value = '') => /^data:image\//i.test(String(value).trim());

const sanitizeProductImages = (product) => {
  if (!product || !Array.isArray(product.images)) return product;

  return {
    ...product,
    images: product.images.filter((image) => typeof image === 'string' && image.trim() !== '' && !isInlineBase64Image(image)),
  };
};

const PENDING_GROCERY_PRODUCT_LIST_PROJECTION = [
  'name',
  'description',
  'mrp',
  'sellingPrice',
  'unit',
  'inStock',
  'stockQuantity',
  'storeId',
  'category',
  'subcategory',
  'subcategories',
  'approvalStatus',
  'rejectionReason',
  'createdAt',
  'requestedCategory',
  'requestedSubcategories',
].join(' ');

const normalizeRequestedSubcategories = (requestedSubcategories = []) => {
  if (!Array.isArray(requestedSubcategories)) return [];
  return requestedSubcategories
    .map((item) => {
      const name = String(item?.name || '').trim();
      const slug = slugify(item?.slug || name);
      if (!name || !slug) return null;
      return { name, slug };
    })
    .filter(Boolean);
};

const resolveRequestedCategoryAndSubcategories = async (product, adminId) => {
  const update = {};
  const storeId = getValidObjectId(product?.storeId);
  let resolvedCategoryId = getValidObjectId(product?.category);

  const requestedCategoryName = String(product?.requestedCategory?.name || '').trim();
  const requestedCategorySlug = slugify(product?.requestedCategory?.slug || requestedCategoryName);

  if (requestedCategorySlug) {
    let category = await GroceryCategory.findOne({ slug: requestedCategorySlug });
    if (!category) {
      category = await GroceryCategory.create({
        name: requestedCategoryName || requestedCategorySlug.replace(/-/g, ' '),
        slug: requestedCategorySlug,
        section: 'Grocery & Kitchen',
        isActive: true,
      });
    } else if (category.isActive === false) {
      category.isActive = true;
      await category.save();
    }

    resolvedCategoryId = category._id;
    update.category = category._id;

    if (storeId) {
      await GroceryCategoryRequest.updateMany(
        {
          storeId,
          approvalStatus: 'pending',
          $or: [{ slug: requestedCategorySlug }, { name: requestedCategoryName }],
        },
        {
          $set: {
            approvalStatus: 'approved',
            approvedBy: adminId,
            approvedAt: new Date(),
            createdCategoryId: category._id,
            rejectionReason: '',
          },
        }
      );
    }
  }

  const requestedSubcategories = normalizeRequestedSubcategories(product?.requestedSubcategories || []);
  if (requestedSubcategories.length > 0 && resolvedCategoryId) {
    const mergedSubcategoryIds = new Set(
      (Array.isArray(product?.subcategories) ? product.subcategories : [])
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => String(id))
    );

    for (const requestedSubcategory of requestedSubcategories) {
      let subcategory = await GrocerySubcategory.findOne({
        category: resolvedCategoryId,
        slug: requestedSubcategory.slug,
      });

      if (!subcategory) {
        subcategory = await GrocerySubcategory.create({
          category: resolvedCategoryId,
          name: requestedSubcategory.name,
          slug: requestedSubcategory.slug,
          isActive: true,
        });
      } else if (subcategory.isActive === false) {
        subcategory.isActive = true;
        await subcategory.save();
      }

      mergedSubcategoryIds.add(String(subcategory._id));

      if (storeId) {
        await GrocerySubcategoryRequest.updateMany(
          {
            storeId,
            approvalStatus: 'pending',
            $or: [{ slug: requestedSubcategory.slug }, { name: requestedSubcategory.name }],
          },
          {
            $set: {
              approvalStatus: 'approved',
              approvedBy: adminId,
              approvedAt: new Date(),
              createdSubcategoryId: subcategory._id,
              category: resolvedCategoryId,
              rejectionReason: '',
            },
          }
        );
      }
    }

    const nextSubcategories = Array.from(mergedSubcategoryIds)
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    update.subcategories = nextSubcategories;
    update.subcategory = nextSubcategories[0] || null;
  }

  return update;
};

/**
 * Get pending grocery products for approval
 * GET /api/admin/grocery/products/pending
 */
export const getPendingGroceryProducts = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, storeId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {
      approvalStatus: 'pending'
    };

    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
      filter.storeId = storeId;
    }

    const [products, total] = await Promise.all([
      GroceryProduct.find(filter)
        .select(PENDING_GROCERY_PRODUCT_LIST_PROJECTION)
        .populate('category', 'name slug section')
        .populate('subcategories', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('storeId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      GroceryProduct.countDocuments(filter)
    ]);

    return successResponse(res, 200, 'Pending products retrieved successfully', {
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching pending grocery products:', error);
    return errorResponse(res, 500, 'Failed to fetch pending products');
  }
});

/**
 * Get a single pending grocery product for approval details
 * GET /api/admin/grocery/products/:id
 */
export const getPendingGroceryProductById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    const product = await GroceryProduct.findOne({
      _id: id,
      approvalStatus: 'pending',
    })
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('storeId', 'name email phone')
      .lean();

    if (!product) {
      return errorResponse(res, 404, 'Pending product not found');
    }

    return successResponse(res, 200, 'Pending product retrieved successfully', {
      product: sanitizeProductImages(product),
    });
  } catch (error) {
    console.error('Error fetching pending grocery product:', error);
    return errorResponse(res, 500, 'Failed to fetch pending product');
  }
});

/**
 * Approve a grocery product
 * PATCH /api/admin/grocery/products/:id/approve
 */
export const approveGroceryProduct = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    const existingProduct = await GroceryProduct.findById(id).lean();
    if (!existingProduct) {
      return errorResponse(res, 404, 'Product not found');
    }

    const requestResolutionUpdate = await resolveRequestedCategoryAndSubcategories(existingProduct, req?.admin?._id || null);

    const product = await GroceryProduct.findByIdAndUpdate(
      id,
      {
        $set: {
          approvalStatus: 'approved',
          rejectionReason: '',
          ...requestResolutionUpdate,
        },
      },
      { new: true, runValidators: true }
    )
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('storeId', 'name email phone')
      .lean();

    return successResponse(res, 200, 'Product approved successfully', { product });
  } catch (error) {
    console.error('Error approving grocery product:', error);
    return errorResponse(res, 500, 'Failed to approve product');
  }
});

/**
 * Reject a grocery product
 * PATCH /api/admin/grocery/products/:id/reject
 */
export const rejectGroceryProduct = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    const product = await GroceryProduct.findByIdAndUpdate(
      id,
      {
        $set: {
          approvalStatus: 'rejected',
          rejectionReason: reason.trim()
        }
      },
      { new: true, runValidators: true }
    )
      .populate('category', 'name slug section')
      .populate('subcategories', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('storeId', 'name email phone')
      .lean();

    if (!product) {
      return errorResponse(res, 404, 'Product not found');
    }

    return successResponse(res, 200, 'Product rejected successfully', { product });
  } catch (error) {
    console.error('Error rejecting grocery product:', error);
    return errorResponse(res, 500, 'Failed to reject product');
  }
});

/**
 * Bulk approve grocery products
 * POST /api/admin/grocery/products/bulk-approve
 */
export const bulkApproveGroceryProducts = asyncHandler(async (req, res) => {
  try {
    const { productIds = [] } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return errorResponse(res, 400, 'Product IDs array is required');
    }

    const validIds = productIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return errorResponse(res, 400, 'No valid product IDs provided');
    }

    const pendingProducts = await GroceryProduct.find({
      _id: { $in: validIds },
      approvalStatus: 'pending',
    }).lean();

    let approvedCount = 0;
    for (const pendingProduct of pendingProducts) {
      const requestResolutionUpdate = await resolveRequestedCategoryAndSubcategories(pendingProduct, req?.admin?._id || null);
      const updateResult = await GroceryProduct.updateOne(
        { _id: pendingProduct._id, approvalStatus: 'pending' },
        {
          $set: {
            approvalStatus: 'approved',
            rejectionReason: '',
            ...requestResolutionUpdate,
          },
        }
      );
      if (updateResult.modifiedCount > 0) {
        approvedCount += 1;
      }
    }

    return successResponse(res, 200, 'Products approved successfully', {
      approved: approvedCount,
      total: validIds.length
    });
  } catch (error) {
    console.error('Error bulk approving grocery products:', error);
    return errorResponse(res, 500, 'Failed to approve products');
  }
});
