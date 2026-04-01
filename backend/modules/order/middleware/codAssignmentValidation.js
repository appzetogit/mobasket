import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Delivery from '../../delivery/models/Delivery.js';
import { errorResponse } from '../../../shared/utils/response.js';
import { validateCODLimitBeforeAssignment } from '../../delivery/services/codLimitService.js';

const hasAcceptedRider = (order = null) => {
  const deliveryStateStatus = String(order?.deliveryState?.status || '').toLowerCase();

  return Boolean(
    order?.deliveryState?.acceptedAt ||
    ['accepted', 'reached_pickup', 'order_confirmed', 'en_route_to_delivery', 'delivered'].includes(deliveryStateStatus) ||
    String(order?.assignmentInfo?.assignedBy || '').toLowerCase() === 'delivery_accept' ||
    String(order?.assignmentInfo?.notificationPhase || '').toLowerCase() === 'accepted' ||
    ['out_for_delivery', 'delivered'].includes(String(order?.status || '').toLowerCase())
  );
};

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

    if (hasAcceptedRider(order)) {
      return errorResponse(
        res,
        409,
        'Order is already accepted by a delivery partner and cannot be reassigned.',
      );
    }

    const deliveryPartner = await Delivery.findById(deliveryPartnerId)
      .select('_id name status isActive availability.isOnline availability.zones')
      .lean();
    if (!deliveryPartner || deliveryPartner.isActive === false) {
      return errorResponse(res, 404, 'Delivery partner not found or inactive');
    }

    if (!deliveryPartner?.availability?.isOnline) {
      return errorResponse(res, 400, 'Selected delivery partner is currently offline');
    }

    const orderZoneId = String(order?.assignmentInfo?.zoneId || '').trim();
    const deliveryZoneIds = Array.isArray(deliveryPartner?.availability?.zones)
      ? deliveryPartner.availability.zones
          .map((zone) => String(zone?._id || zone || '').trim())
          .filter(Boolean)
      : [];

    if (orderZoneId && !deliveryZoneIds.includes(orderZoneId)) {
      return errorResponse(res, 400, 'Selected delivery partner is not available in this order zone');
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
