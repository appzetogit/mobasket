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

const normalizeStoreOnboardingState = (store) => {
  const onboarding = { ...(store?.onboarding || {}) };
  const isProvisioned =
    store?.isActive === true ||
    Boolean(store?.approvedAt) ||
    Boolean(store?.rejectedAt) ||
    Boolean(String(store?.rejectionReason || '').trim()) ||
    Number(onboarding?.completedSteps || 0) >= 1;

  if (isProvisioned && Number(onboarding?.completedSteps || 0) < 1) {
    onboarding.completedSteps = 1;
  }

  return onboarding;
};

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

    const onboarding = normalizeStoreOnboardingState(store);
    const normalizedStep1 = {
      storeName: onboarding.step1?.storeName || store.name || '',
      ownerName: onboarding.step1?.ownerName || store.ownerName || '',
      ownerEmail: onboarding.step1?.ownerEmail || store.ownerEmail || store.email || '',
      ownerPhone: onboarding.step1?.ownerPhone || store.ownerPhone || store.phone || '',
      primaryContactNumber:
        onboarding.step1?.primaryContactNumber ||
        store.primaryContactNumber ||
        store.phone ||
        '',
      location: {
        ...(onboarding.step1?.location || {}),
        formattedAddress:
          onboarding.step1?.location?.formattedAddress ||
          store.location?.formattedAddress ||
          '',
        address:
          onboarding.step1?.location?.address ||
          store.location?.address ||
          '',
        addressLine1:
          onboarding.step1?.location?.addressLine1 ||
          store.location?.addressLine1 ||
          '',
        addressLine2:
          onboarding.step1?.location?.addressLine2 ||
          store.location?.addressLine2 ||
          '',
        area:
          onboarding.step1?.location?.area ||
          store.location?.area ||
          '',
        city:
          onboarding.step1?.location?.city ||
          store.location?.city ||
          '',
        state:
          onboarding.step1?.location?.state ||
          store.location?.state ||
          '',
        landmark:
          onboarding.step1?.location?.landmark ||
          store.location?.landmark ||
          '',
        zipCode:
          onboarding.step1?.location?.zipCode ||
          store.location?.zipCode ||
          store.location?.postalCode ||
          store.location?.pincode ||
          '',
      },
    };

    return successResponse(res, 200, 'Onboarding data retrieved successfully', {
      onboarding: {
        ...onboarding,
        step1: normalizedStep1,
      },
      store: {
        _id: store._id,
        name: store.name,
        ownerName: store.ownerName,
        ownerEmail: store.ownerEmail,
        ownerPhone: store.ownerPhone,
        primaryContactNumber: store.primaryContactNumber,
        location: store.location,
        profileImage: store.profileImage,
        menuImages: store.menuImages,
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
    const { step1, storeImage, additionalImages, completedSteps } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'platform')) {
      const requestedPlatform = String(req.body.platform || '').trim().toLowerCase();
      if (requestedPlatform && requestedPlatform !== 'mogrocery') {
        return errorResponse(res, 400, 'Platform cannot be changed from grocery store onboarding.');
      }
    }

    const update = {};

    if (step1 && typeof step1 === 'object') {
      update['onboarding.step1'] = step1;

      if (step1.storeName !== undefined) {
        update.name = String(step1.storeName || '').trim();
      }
      if (step1.ownerName !== undefined) {
        update.ownerName = String(step1.ownerName || '').trim();
      }
      if (step1.ownerEmail !== undefined) {
        update.ownerEmail = String(step1.ownerEmail || '').trim().toLowerCase();
      }
      if (step1.ownerPhone !== undefined) {
        update.ownerPhone = String(step1.ownerPhone || '').trim();
      }
      if (step1.primaryContactNumber !== undefined) {
        update.primaryContactNumber = String(step1.primaryContactNumber || '').trim();
      }
      if (step1.location !== undefined) {
        update.location = {
          ...(req.store.location || {}),
          ...(step1.location || {}),
        };
      }
    }

    if (storeImage !== undefined) {
      update['onboarding.storeImage'] = storeImage;
      update.profileImage = storeImage;
    }

    if (additionalImages !== undefined) {
      update['onboarding.additionalImages'] = additionalImages;
      update.menuImages = additionalImages;
    }

    const normalizedCompletedSteps = Number(completedSteps);
    if (Number.isFinite(normalizedCompletedSteps)) {
      update['onboarding.completedSteps'] = normalizedCompletedSteps;

      // A newly completed grocery onboarding should stay in the admin review queue
      // until an admin explicitly approves the store.
      if (
        normalizedCompletedSteps >= 1 &&
        !req.store?.approvedAt
      ) {
        update.isActive = false;
        update.isAcceptingOrders = false;
        update.rejectionReason = null;
        update.rejectedAt = null;
        update.rejectedBy = null;
      }
    }

    if (!update.name) {
      update.name = req.store.name;
    }
    if (!update.ownerName) {
      update.ownerName = req.store.ownerName;
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
        ownerName: store.ownerName,
        ownerEmail: store.ownerEmail,
        ownerPhone: store.ownerPhone,
        primaryContactNumber: store.primaryContactNumber,
        location: store.location,
        profileImage: store.profileImage,
        menuImages: store.menuImages,
        isActive: store.isActive,
      }
    });
  } catch (error) {
    logger.error(`Error updating onboarding: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update onboarding data');
  }
});
