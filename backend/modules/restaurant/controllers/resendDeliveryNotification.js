import Order from '../../order/models/Order.js';
import Restaurant from '../models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { findNearestDeliveryBoys } from '../../order/services/deliveryAssignmentService.js';
import { notifyMultipleDeliveryBoys } from '../../order/services/deliveryNotificationService.js';
import mongoose from 'mongoose';

const DELIVERY_EXPANSION_DELAY_MS = 30000;

const resolveStoreCoordinatesForOrder = async (order, restaurant) => {
  const restaurantIdCandidates = Array.from(
    new Set(
      [
        restaurant?._id?.toString?.(),
        restaurant?.restaurantId?.toString?.(),
        restaurant?.id?.toString?.(),
        order?.restaurantId?.toString?.(),
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  const primaryRestaurantId = restaurantIdCandidates[0];
  if (!primaryRestaurantId) {
    return null;
  }

  let entityDoc = mongoose.Types.ObjectId.isValid(primaryRestaurantId)
    ? await Restaurant.findById(primaryRestaurantId).select('location').lean()
    : null;

  if (!entityDoc && mongoose.Types.ObjectId.isValid(primaryRestaurantId)) {
    entityDoc = await GroceryStore.findById(primaryRestaurantId).select('location').lean();
  }

  if (!entityDoc) {
    entityDoc = await Restaurant.findOne({ restaurantId: { $in: restaurantIdCandidates } })
      .select('location')
      .lean();
  }

  if (!entityDoc) {
    entityDoc = await GroceryStore.findOne({ restaurantId: { $in: restaurantIdCandidates } })
      .select('location')
      .lean();
  }

  const locationFromEntity = entityDoc?.location || {};
  const locationFromAuth = restaurant?.location || {};
  const locationFromOrder = order?.restaurantLocation || {};
  const coordinates =
    (Array.isArray(locationFromEntity?.coordinates) && locationFromEntity.coordinates.length >= 2
      ? locationFromEntity.coordinates
      : null) ||
    (Array.isArray(locationFromAuth?.coordinates) && locationFromAuth.coordinates.length >= 2
      ? locationFromAuth.coordinates
      : null) ||
    (Array.isArray(locationFromOrder?.coordinates) && locationFromOrder.coordinates.length >= 2
      ? locationFromOrder.coordinates
      : null);

  if (!coordinates) {
    return null;
  }

  const [restaurantLng, restaurantLat] = coordinates;
  return { restaurantLat, restaurantLng };
};

export const notifyDeliveryPartnersForOrder = async ({
  order,
  restaurant,
  assignedBy = 'manual_resend',
}) => {
  if (!order?._id) {
    return { success: false, message: 'Order not found' };
  }

  const coords = await resolveStoreCoordinatesForOrder(order, restaurant);
  if (!coords) {
    return { success: false, message: 'Store location not found. Please update store location.' };
  }

  const { restaurantLat, restaurantLng } = coords;
  const requiredZoneId = order?.assignmentInfo?.zoneId ? String(order.assignmentInfo.zoneId) : null;
  const incomingCodAmount = ['cash', 'cod'].includes(String(order?.payment?.method || '').toLowerCase())
    ? Math.max(0, Number(order?.pricing?.total) || 0)
    : 0;

  const priorityDeliveryBoys = await findNearestDeliveryBoys(
    restaurantLat,
    restaurantLng,
    order.restaurantId,
    20,
    { requiredZoneId, incomingCodAmount }
  );

  const populatedOrder = await Order.findById(order._id)
    .populate('userId', 'name phone')
    .populate('restaurantId', 'name location address phone ownerPhone')
    .lean();

  if (!populatedOrder) {
    return { success: false, message: 'Order not found' };
  }

  const now = new Date();

  if (!priorityDeliveryBoys || priorityDeliveryBoys.length === 0) {
    const allDeliveryBoys = await findNearestDeliveryBoys(
      restaurantLat,
      restaurantLng,
      order.restaurantId,
      50,
      { requiredZoneId, incomingCodAmount }
    );

    if (!allDeliveryBoys || allDeliveryBoys.length === 0) {
      return { success: false, message: 'No delivery partners available in your area' };
    }

    const deliveryPartnerIds = allDeliveryBoys.map((db) => db.deliveryPartnerId);

    await Order.findByIdAndUpdate(order._id, {
      $set: {
        'assignmentInfo.priorityDeliveryPartnerIds': deliveryPartnerIds,
        'assignmentInfo.assignedBy': assignedBy,
        'assignmentInfo.assignedAt': now,
        'assignmentInfo.notificationPhase': 'priority',
        'assignmentInfo.priorityNotifiedAt': now,
      }
    });

    await notifyMultipleDeliveryBoys(populatedOrder, deliveryPartnerIds, 'priority');
    return { success: true, notifiedCount: deliveryPartnerIds.length, phase: 'priority' };
  }

  const priorityIds = priorityDeliveryBoys.map((db) => db.deliveryPartnerId);

  await Order.findByIdAndUpdate(order._id, {
    $set: {
      'assignmentInfo.priorityDeliveryPartnerIds': priorityIds,
      'assignmentInfo.assignedBy': assignedBy,
      'assignmentInfo.assignedAt': now,
      'assignmentInfo.notificationPhase': 'priority',
      'assignmentInfo.priorityNotifiedAt': now,
    }
  });

  await notifyMultipleDeliveryBoys(populatedOrder, priorityIds, 'priority');

  setTimeout(async () => {
    try {
      const latestOrder = await Order.findById(order._id);
      if (!latestOrder || latestOrder.deliveryPartnerId) {
        return;
      }

      if (!['preparing', 'ready'].includes(String(latestOrder.status || '').toLowerCase())) {
        return;
      }

      const expandedDeliveryBoys = await findNearestDeliveryBoys(
        restaurantLat,
        restaurantLng,
        latestOrder.restaurantId,
        50,
        { requiredZoneId, incomingCodAmount }
      );

      if (!expandedDeliveryBoys || expandedDeliveryBoys.length === 0) {
        return;
      }

      const expandedIds = expandedDeliveryBoys
        .map((db) => db.deliveryPartnerId)
        .filter((id) => !priorityIds.includes(id));

      if (expandedIds.length === 0) {
        return;
      }

      const expandedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();

      if (!expandedOrder) {
        return;
      }

      await Order.findByIdAndUpdate(order._id, {
        $set: {
          'assignmentInfo.expandedNotifiedAt': new Date(),
          'assignmentInfo.expandedDeliveryPartnerIds': expandedIds,
          'assignmentInfo.notificationPhase': 'expanded',
        }
      });

      await notifyMultipleDeliveryBoys(expandedOrder, expandedIds, 'expanded');
    } catch (expandError) {
      console.error(`Failed expanded notification for order ${order.orderId || order._id}:`, expandError);
    }
  }, DELIVERY_EXPANSION_DELAY_MS);

  return { success: true, notifiedCount: priorityIds.length, phase: 'priority' };
};

/**
 * Resend delivery notification for unassigned order
 * POST /api/restaurant/orders/:id/resend-delivery-notification
 */
export const resendDeliveryNotification = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantIdCandidates = Array.from(
      new Set(
        [
          restaurant?._id?.toString?.(),
          restaurant?.restaurantId?.toString?.(),
          restaurant?.id?.toString?.()
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );

    if (!restaurantIdCandidates[0]) {
      return errorResponse(res, 400, 'Store/restaurant identity not found');
    }

    let order = null;

    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdCandidates }
      });
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdCandidates }
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    if (!['preparing', 'ready'].includes(order.status)) {
      return errorResponse(res, 400, `Cannot resend notification. Order status must be 'preparing' or 'ready'. Current status: ${order.status}`);
    }

    const notifyResult = await notifyDeliveryPartnersForOrder({
      order,
      restaurant,
      assignedBy: 'manual_resend',
    });

    if (!notifyResult.success) {
      const statusCode = notifyResult.message === 'No delivery partners available in your area' ? 404 : 400;
      return errorResponse(res, statusCode, notifyResult.message);
    }

    const refreshedOrder = await Order.findById(order._id)
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name location address phone ownerPhone')
      .lean();

    return successResponse(
      res,
      200,
      `Notification sent to ${notifyResult.notifiedCount} delivery partners`,
      {
        order: refreshedOrder || order,
        notifiedCount: notifyResult.notifiedCount,
        phase: notifyResult.phase,
      }
    );
  } catch (error) {
    console.error('Error resending delivery notification:', error);
    return errorResponse(res, 500, `Failed to resend notification: ${error.message}`);
  }
});
