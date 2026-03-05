import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Delivery from '../../delivery/models/Delivery.js';
import { errorResponse } from '../../../shared/utils/response.js';
import { validateCODLimitBeforeAssignment } from '../../delivery/services/codLimitService.js';

export const validateOrderAssignmentPayload = async (req, res, next) => {
  try {
    const { orderId, deliveryPartnerId } = req.body || {};

    if (!orderId || !deliveryPartnerId) {
      return errorResponse(res, 400, 'orderId and deliveryPartnerId are required');
    }

    const orderQuery = mongoose.Types.ObjectId.isValid(String(orderId))
      ? { $or: [{ _id: String(orderId) }, { orderId: String(orderId) }] }
      : { orderId: String(orderId) };

    const order = await Order.findOne(orderQuery).lean();
    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    const normalizedStatus = String(order.status || '').toLowerCase();
    if (!['preparing', 'ready'].includes(normalizedStatus)) {
      return errorResponse(
        res,
        400,
        `Order cannot be assigned. Current status: ${order.status}. Allowed: preparing, ready.`,
      );
    }

    const deliveryPartner = await Delivery.findById(deliveryPartnerId)
      .select('_id name status isActive')
      .lean();
    if (!deliveryPartner || deliveryPartner.isActive === false) {
      return errorResponse(res, 404, 'Delivery partner not found or inactive');
    }

    const codValidation = await validateCODLimitBeforeAssignment({
      deliveryId: deliveryPartner._id,
      order,
    });

    if (!codValidation.isAllowed) {
      return errorResponse(
        res,
        400,
        'COD limit exceeded for this delivery partner. Assign a different rider or settle collected cash first.',
        {
          codLimit: codValidation.codLimit,
          cashCollected: codValidation.cashCollected,
          remainingLimit: codValidation.remainingLimit,
          orderCODAmount: codValidation.orderCODAmount,
          projectedCashCollected: codValidation.projectedCashCollected,
        },
      );
    }

    req.assignmentCandidate = {
      order,
      deliveryPartner,
      codValidation,
    };

    return next();
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to validate assignment request');
  }
};
