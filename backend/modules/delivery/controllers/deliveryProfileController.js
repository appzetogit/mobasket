import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
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
 * Get Delivery Partner Profile
 * GET /api/delivery/profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery; // From authenticate middleware

    // Populate related fields if needed
    const profile = await Delivery.findById(delivery._id)
      .select('-password -refreshToken')
      .lean();

    if (!profile) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    return successResponse(res, 200, 'Profile retrieved successfully', {
      profile
    });
  } catch (error) {
    logger.error(`Error fetching delivery profile: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch profile');
  }
});

/**
 * Update Delivery Partner Profile
 * PUT /api/delivery/profile
 */
const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  email: Joi.string().email().lowercase().trim().optional().allow(null, ''),
  dateOfBirth: Joi.date().optional().allow(null),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer-not-to-say').optional(),
  vehicle: Joi.object({
    type: Joi.string().valid('bike', 'scooter', 'bicycle', 'car').optional(),
    number: Joi.string().trim().optional().allow(null, ''),
    model: Joi.string().trim().optional().allow(null, ''),
    brand: Joi.string().trim().optional().allow(null, '')
  }).optional(),
  location: Joi.object({
    addressLine1: Joi.string().trim().optional().allow(null, ''),
    addressLine2: Joi.string().trim().optional().allow(null, ''),
    area: Joi.string().trim().optional().allow(null, ''),
    city: Joi.string().trim().optional().allow(null, ''),
    state: Joi.string().trim().optional().allow(null, ''),
    zipCode: Joi.string().trim().optional().allow(null, '')
  }).optional(),
  profileImage: Joi.object({
    url: Joi.string().uri().optional().allow(null, ''),
    publicId: Joi.string().trim().optional().allow(null, '')
  }).optional(),
  documents: Joi.object({
    bankDetails: Joi.object({
      accountHolderName: Joi.string().trim().min(2).max(100).pattern(/^[a-zA-Z\s'-]+$/).messages({
        'string.pattern.base': 'Account holder name can only contain letters, spaces, apostrophes, and hyphens'
      }).optional().allow(null, ''),
      accountNumber: Joi.string().trim().pattern(/^[0-9]{9,18}$/).messages({
        'string.pattern.base': 'Account number must be between 9 and 18 digits'
      }).optional().allow(null, ''),
      ifscCode: Joi.string().trim().length(11).uppercase().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).messages({
        'string.pattern.base': 'Invalid IFSC code format. Format: AAAA0####0 (e.g., HDFC0001234)'
      }).optional().allow(null, ''),
      bankName: Joi.string().trim().min(2).max(100).pattern(/^[a-zA-Z\s'&-]+$/).messages({
        'string.pattern.base': 'Bank name can only contain letters, spaces, apostrophes, hyphens, and ampersands'
      }).optional().allow(null, '')
    }).optional(),
    aadhar: Joi.object({
      number: Joi.string().trim().optional().allow(null, ''),
      document: Joi.string().uri().optional().allow(null, ''),
      verified: Joi.boolean().optional()
    }).optional(),
    pan: Joi.object({
      number: Joi.string().trim().optional().allow(null, ''),
      document: Joi.string().uri().optional().allow(null, ''),
      verified: Joi.boolean().optional()
    }).optional(),
    drivingLicense: Joi.object({
      number: Joi.string().trim().optional().allow(null, ''),
      document: Joi.string().uri().optional().allow(null, ''),
      expiryDate: Joi.date().optional().allow(null),
      verified: Joi.boolean().optional()
    }).optional()
  }).optional()
});

export const updateProfile = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const updateData = req.body;

    // Validate input
    const { error } = updateProfileSchema.validate(updateData);
    if (error) {
      return errorResponse(res, 400, error.details[0].message);
    }

    // 1. Fetch fresh delivery document
    const deliveryDoc = await Delivery.findById(delivery._id).select('+password');
    if (!deliveryDoc) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    let documentUpdatedForStatus = false;

    // 2. Handle Documents (Nested) - Explicitly use .set() for reliability
    if (updateData.documents) {
      const docs = updateData.documents;

      // Ensure documents object exists in the Mongoose document
      if (!deliveryDoc.documents) {
        deliveryDoc.documents = {};
      }

      if (docs.aadhar) {
        if (docs.aadhar.number) deliveryDoc.set('documents.aadhar.number', docs.aadhar.number);
        if (docs.aadhar.document) {
          deliveryDoc.set('documents.aadhar.document', docs.aadhar.document);
          deliveryDoc.set('documents.aadhar.verified', false);
          documentUpdatedForStatus = true;
        }
      }

      if (docs.pan) {
        if (docs.pan.number) deliveryDoc.set('documents.pan.number', docs.pan.number);
        if (docs.pan.document) {
          deliveryDoc.set('documents.pan.document', docs.pan.document);
          deliveryDoc.set('documents.pan.verified', false);
          documentUpdatedForStatus = true;
        }
      }

      if (docs.drivingLicense) {
        if (docs.drivingLicense.number) deliveryDoc.set('documents.drivingLicense.number', docs.drivingLicense.number);
        if (docs.drivingLicense.document) {
          deliveryDoc.set('documents.drivingLicense.document', docs.drivingLicense.document);
          deliveryDoc.set('documents.drivingLicense.verified', false);
          documentUpdatedForStatus = true;
        }
      }

      if (docs.bankDetails) {
        if (docs.bankDetails.accountHolderName) deliveryDoc.set('documents.bankDetails.accountHolderName', docs.bankDetails.accountHolderName);
        if (docs.bankDetails.accountNumber) deliveryDoc.set('documents.bankDetails.accountNumber', docs.bankDetails.accountNumber);
        if (docs.bankDetails.ifscCode) deliveryDoc.set('documents.bankDetails.ifscCode', docs.bankDetails.ifscCode);
        if (docs.bankDetails.bankName) deliveryDoc.set('documents.bankDetails.bankName', docs.bankDetails.bankName);
      }
    }

    // 3. Handle Other Fields
    if (updateData.name && updateData.name !== deliveryDoc.name) {
      deliveryDoc.name = updateData.name;
      documentUpdatedForStatus = true;
    }
    if (updateData.email !== undefined && updateData.email !== deliveryDoc.email) {
      deliveryDoc.email = updateData.email;
      documentUpdatedForStatus = true;
    }
    if (updateData.dateOfBirth) deliveryDoc.dateOfBirth = updateData.dateOfBirth;
    if (updateData.gender) deliveryDoc.gender = updateData.gender;

    if (updateData.vehicle) {
      if (updateData.vehicle.type) deliveryDoc.set('vehicle.type', updateData.vehicle.type);
      if (updateData.vehicle.number) deliveryDoc.set('vehicle.number', updateData.vehicle.number);
      if (updateData.vehicle.model) deliveryDoc.set('vehicle.model', updateData.vehicle.model);
      if (updateData.vehicle.brand) deliveryDoc.set('vehicle.brand', updateData.vehicle.brand);
    }

    if (updateData.location) {
      if (updateData.location.addressLine1) deliveryDoc.set('location.addressLine1', updateData.location.addressLine1);
      if (updateData.location.city) deliveryDoc.set('location.city', updateData.location.city);
      if (updateData.location.state) deliveryDoc.set('location.state', updateData.location.state);
    }

    if (updateData.profileImage) {
      if (updateData.profileImage.url !== undefined) deliveryDoc.set('profileImage.url', updateData.profileImage.url);
      if (updateData.profileImage.publicId !== undefined) deliveryDoc.set('profileImage.publicId', updateData.profileImage.publicId);
    }

    // 4. Update status if documents were updated
    if (documentUpdatedForStatus) {
      deliveryDoc.status = 'pending';
      deliveryDoc.rejectionReason = null;
      deliveryDoc.rejectedAt = null;
      deliveryDoc.rejectedBy = null;
    }

    // 5. Save and return
    const savedDelivery = await deliveryDoc.save();

    const profileResponse = savedDelivery.toObject();
    delete profileResponse.password;
    delete profileResponse.refreshToken;

    logger.info('Profile updated successfully', {
      deliveryId: savedDelivery.deliveryId || savedDelivery._id
    });

    return successResponse(res, 200, 'Profile updated successfully', {
      profile: profileResponse
    });
  } catch (error) {
    logger.error(`Error updating delivery profile: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update profile');
  }
});

/**
 * Reverify Delivery Partner (Resubmit for approval)
 * POST /api/delivery/reverify
 */
export const reverify = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    if (delivery.status !== 'blocked') {
      return errorResponse(res, 400, 'Only rejected delivery partners can resubmit for verification');
    }

    // Reset to pending status and clear rejection details
    delivery.status = 'pending';
    delivery.isActive = true; // Allow login to see verification message
    delivery.rejectionReason = null;
    delivery.rejectedAt = null;
    delivery.rejectedBy = null;

    await delivery.save();

    logger.info(`Delivery partner resubmitted for verification: ${delivery._id}`, {
      deliveryId: delivery.deliveryId
    });

    return successResponse(res, 200, 'Request resubmitted for verification successfully', {
      profile: {
        _id: delivery._id.toString(),
        name: delivery.name,
        status: delivery.status
      }
    });
  } catch (error) {
    logger.error(`Error reverifying delivery partner: ${error.message}`);
    return errorResponse(res, 500, 'Failed to resubmit for verification');
  }
});

