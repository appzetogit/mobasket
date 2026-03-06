import GroceryStore from '../models/GroceryStore.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
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

/**
 * Get Grocery Store Onboarding Data
 * GET /api/grocery/store/onboarding
 */
export const getOnboarding = asyncHandler(async (req, res) => {
  try {
    const storeId = req.store._id;
    const store = await GroceryStore.findById(storeId).lean();

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    const onboarding = store.onboarding || {};

    return successResponse(res, 200, 'Onboarding data retrieved successfully', {
      onboarding,
      store: {
        _id: store._id,
        name: store.name,
        isActive: store.isActive,
      }
    });
  } catch (error) {
    logger.error(`Error fetching onboarding: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch onboarding data');
  }
});

/**
 * Update Grocery Store Onboarding Data
 * PUT /api/grocery/store/onboarding
 */
export const updateOnboarding = asyncHandler(async (req, res) => {
  try {
    const storeId = req.store._id;
    const { storeImage, additionalImages, completedSteps } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'platform')) {
      const requestedPlatform = String(req.body.platform || '').trim().toLowerCase();
      if (requestedPlatform && requestedPlatform !== 'mogrocery') {
        return errorResponse(res, 400, 'Platform cannot be changed from grocery store onboarding.');
      }
    }

    const update = {};

    if (storeImage !== undefined) {
      update['onboarding.storeImage'] = storeImage;
    }

    if (additionalImages !== undefined) {
      update['onboarding.additionalImages'] = additionalImages;
    }

    const normalizedCompletedSteps = Number(completedSteps);
    if (Number.isFinite(normalizedCompletedSteps)) {
      update['onboarding.completedSteps'] = normalizedCompletedSteps;
    }

    const store = await GroceryStore.findByIdAndUpdate(
      storeId,
      { $set: update },
      { new: true }
    ).lean();

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    return successResponse(res, 200, 'Onboarding data updated successfully', {
      onboarding: store.onboarding || {},
      store: {
        _id: store._id,
        name: store.name,
        isActive: store.isActive,
      }
    });
  } catch (error) {
    logger.error(`Error updating onboarding: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update onboarding data');
  }
});
