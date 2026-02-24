import Restaurant from '../../restaurant/models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import winston from 'winston';
import mongoose from 'mongoose';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Get All Grocery Stores
 * GET /api/grocery/stores
 */
export const getGroceryStores = asyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50,
      search,
      status
    } = req.query;

    const query = { platform: 'mogrocery' };

    if (status === 'inactive') {
      query.isActive = false;
    } else if (status === 'active') {
      query.isActive = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const stores = await Restaurant.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Restaurant.countDocuments(query);

    return successResponse(res, 200, 'Grocery stores retrieved successfully', {
      stores,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching grocery stores: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch grocery stores');
  }
});

/**
 * Create Grocery Store
 * POST /api/grocery/stores
 */
export const createGroceryStore = asyncHandler(async (req, res) => {
  try {
    const storeData = { ...req.body, platform: 'mogrocery' };

    // "Single Only" check: if there's already a grocery store, prevent creating another
    // This can be adjusted if "single only" means something else.
    const existingStore = await Restaurant.findOne({ platform: 'mogrocery' });
    if (existingStore) {
      return errorResponse(res, 400, 'A grocery store already exists. Only one store is allowed.');
    }

    if (storeData.phone) {
      storeData.phone = normalizePhoneNumber(storeData.phone);
    }
    if (storeData.ownerPhone) {
      storeData.ownerPhone = normalizePhoneNumber(storeData.ownerPhone);
    }

    const store = await Restaurant.create(storeData);
    
    const storeResponse = store.toObject();
    delete storeResponse.password;

    return successResponse(res, 201, 'Grocery store created successfully', { store: storeResponse });
  } catch (error) {
    logger.error(`Error creating grocery store: ${error.message}`);
    return errorResponse(res, 500, 'Failed to create grocery store');
  }
});

/**
 * Get Grocery Store By ID
 * GET /api/grocery/stores/:id
 */
export const getGroceryStoreById = asyncHandler(async (req, res) => {
  try {
    const store = await Restaurant.findOne({ _id: req.params.id, platform: 'mogrocery' })
      .select('-password')
      .lean();

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    return successResponse(res, 200, 'Grocery store retrieved successfully', { store });
  } catch (error) {
    return errorResponse(res, 500, 'Failed to fetch grocery store');
  }
});

/**
 * Update Grocery Store
 * PUT /api/grocery/stores/:id
 */
export const updateGroceryStore = asyncHandler(async (req, res) => {
  try {
    const store = await Restaurant.findOneAndUpdate(
      { _id: req.params.id, platform: 'mogrocery' },
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    return successResponse(res, 200, 'Grocery store updated successfully', { store });
  } catch (error) {
    return errorResponse(res, 500, 'Failed to update grocery store');
  }
});

/**
 * Update Grocery Store Status
 * PATCH /api/grocery/stores/:id/status
 */
export const updateGroceryStoreStatus = asyncHandler(async (req, res) => {
  try {
    const { isActive } = req.body;
    const store = await Restaurant.findOneAndUpdate(
      { _id: req.params.id, platform: 'mogrocery' },
      { isActive },
      { new: true }
    ).select('-password');

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    return successResponse(res, 200, `Grocery store ${isActive ? 'activated' : 'deactivated'} successfully`, { store });
  } catch (error) {
    return errorResponse(res, 500, 'Failed to update grocery store status');
  }
});

/**
 * Delete Grocery Store
 * DELETE /api/grocery/stores/:id
 */
export const deleteGroceryStore = asyncHandler(async (req, res) => {
  try {
    const store = await Restaurant.findOneAndDelete({ _id: req.params.id, platform: 'mogrocery' });

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    return successResponse(res, 200, 'Grocery store deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to delete grocery store');
  }
});
