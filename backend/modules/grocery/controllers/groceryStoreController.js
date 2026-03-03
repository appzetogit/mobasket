import GroceryStore from '../models/GroceryStore.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const buildStoreSearchOr = (search = '') => ([
  { name: { $regex: search, $options: 'i' } },
  { ownerName: { $regex: search, $options: 'i' } },
  { phone: { $regex: search, $options: 'i' } },
  { email: { $regex: search, $options: 'i' } }
]);

const hydrateMissingLegacyGroceryStores = async ({ search, status }) => {
  try {
    const legacyQuery = { platform: 'mogrocery' };

    if (status === 'inactive') {
      legacyQuery.isActive = false;
    } else if (status === 'active') {
      legacyQuery.isActive = true;
    }

    if (search) {
      legacyQuery.$or = buildStoreSearchOr(search);
    }

    const legacyStores = await Restaurant.find(legacyQuery)
      .select('+password')
      .lean();

    if (!legacyStores.length) return;

    const legacyIds = legacyStores.map((store) => store._id);
    const existingStores = await GroceryStore.find({ _id: { $in: legacyIds } })
      .select('_id')
      .lean();
    const existingIds = new Set(existingStores.map((store) => store._id.toString()));

    const missingLegacyStores = legacyStores.filter(
      (store) => !existingIds.has(store._id.toString())
    );
    if (!missingLegacyStores.length) return;

    const bulkOps = missingLegacyStores.map((store) => {
      const plain = { ...store };
      delete plain.__v;
      plain.platform = 'mogrocery';

      return {
        updateOne: {
          filter: { _id: store._id },
          update: { $set: plain },
          upsert: true,
        },
      };
    });

    await GroceryStore.bulkWrite(bulkOps, { ordered: false });
    logger.info(`Hydrated ${missingLegacyStores.length} legacy mogrocery stores into GroceryStore collection`);
  } catch (error) {
    logger.warn(`Legacy grocery store hydration skipped: ${error.message}`);
  }
};

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

    const query = {};

    if (status === 'inactive') {
      query.isActive = false;
    } else if (status === 'active') {
      query.isActive = true;
    }

    if (search) {
      query.$or = buildStoreSearchOr(search);
    }

    // Ensure old mogrocery stores from legacy Restaurant collection are visible
    // even if dedicated migration was not run for all records.
    await hydrateMissingLegacyGroceryStores({ search, status });

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const stores = await GroceryStore.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await GroceryStore.countDocuments(query);

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
    const storeData = { ...req.body };

    if (storeData.phone) {
      storeData.phone = normalizePhoneNumber(storeData.phone);
    }
    if (storeData.ownerPhone) {
      storeData.ownerPhone = normalizePhoneNumber(storeData.ownerPhone);
    }

    const store = await GroceryStore.create(storeData);
    
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
    const store = await GroceryStore.findById(req.params.id)
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
    const store = await GroceryStore.findOneAndUpdate(
      { _id: req.params.id },
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
    const store = await GroceryStore.findOneAndUpdate(
      { _id: req.params.id },
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
    const store = await GroceryStore.findOneAndDelete({ _id: req.params.id });

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    return successResponse(res, 200, 'Grocery store deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to delete grocery store');
  }
});
