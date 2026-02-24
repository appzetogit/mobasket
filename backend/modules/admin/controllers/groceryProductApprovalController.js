import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import GroceryProduct from '../../grocery/models/GroceryProduct.js';
import mongoose from 'mongoose';

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
 * Approve a grocery product
 * PATCH /api/admin/grocery/products/:id/approve
 */
export const approveGroceryProduct = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid product ID');
    }

    const product = await GroceryProduct.findByIdAndUpdate(
      id,
      {
        $set: {
          approvalStatus: 'approved',
          rejectionReason: ''
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

    const result = await GroceryProduct.updateMany(
      { _id: { $in: validIds }, approvalStatus: 'pending' },
      {
        $set: {
          approvalStatus: 'approved',
          rejectionReason: ''
        }
      }
    );

    return successResponse(res, 200, 'Products approved successfully', {
      approved: result.modifiedCount,
      total: validIds.length
    });
  } catch (error) {
    console.error('Error bulk approving grocery products:', error);
    return errorResponse(res, 500, 'Failed to approve products');
  }
});
