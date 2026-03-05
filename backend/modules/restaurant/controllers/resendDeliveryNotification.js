import Order from '../../order/models/Order.js';
import Restaurant from '../models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { findNearestDeliveryBoys } from '../../order/services/deliveryAssignmentService.js';
import { notifyMultipleDeliveryBoys } from '../../order/services/deliveryNotificationService.js';
import mongoose from 'mongoose';

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

    const primaryRestaurantId = restaurantIdCandidates[0];
    if (!primaryRestaurantId) {
      return errorResponse(res, 400, 'Store/restaurant identity not found');
    }

    // Try to find order by MongoDB _id or orderId
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

    // Check if order is in valid status (preparing or ready)
    if (!['preparing', 'ready'].includes(order.status)) {
      return errorResponse(res, 400, `Cannot resend notification. Order status must be 'preparing' or 'ready'. Current status: ${order.status}`);
    }

    // Resolve location for both Restaurant and GroceryStore sources.
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
      return errorResponse(res, 400, 'Store location not found. Please update store location.');
    }

    const [restaurantLng, restaurantLat] = coordinates;

    // Find nearest delivery boys
    const requiredZoneId = order?.assignmentInfo?.zoneId ? String(order.assignmentInfo.zoneId) : null;
    const incomingCodAmount = ['cash', 'cod'].includes(String(order?.payment?.method || '').toLowerCase())
      ? Math.max(0, Number(order?.pricing?.total) || 0)
      : 0;
    const priorityDeliveryBoys = await findNearestDeliveryBoys(
      restaurantLat,
      restaurantLng,
      order.restaurantId,
      20, // 20km radius for priority
      { requiredZoneId, incomingCodAmount }
    );

    if (!priorityDeliveryBoys || priorityDeliveryBoys.length === 0) {
      // Try with larger radius
      const allDeliveryBoys = await findNearestDeliveryBoys(
        restaurantLat,
        restaurantLng,
        order.restaurantId,
        50, // 50km radius
        { requiredZoneId, incomingCodAmount }
      );

      if (!allDeliveryBoys || allDeliveryBoys.length === 0) {
        return errorResponse(res, 404, 'No delivery partners available in your area');
      }

      // Notify all available delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();

      if (populatedOrder) {
        const deliveryPartnerIds = allDeliveryBoys.map(db => db.deliveryPartnerId);
        
        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'assignmentInfo.priorityDeliveryPartnerIds': deliveryPartnerIds,
            'assignmentInfo.assignedBy': 'manual_resend',
            'assignmentInfo.assignedAt': new Date()
          }
        });

        await notifyMultipleDeliveryBoys(populatedOrder, deliveryPartnerIds, 'priority');
        
        console.log(`✅ Resent notification to ${deliveryPartnerIds.length} delivery partners for order ${order.orderId}`);

        return successResponse(res, 200, `Notification sent to ${deliveryPartnerIds.length} delivery partners`, {
          order: populatedOrder,
          notifiedCount: deliveryPartnerIds.length
        });
      }
    } else {
      // Notify priority delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();

      if (populatedOrder) {
        const priorityIds = priorityDeliveryBoys.map(db => db.deliveryPartnerId);
        
        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'assignmentInfo.priorityDeliveryPartnerIds': priorityIds,
            'assignmentInfo.assignedBy': 'manual_resend',
            'assignmentInfo.assignedAt': new Date()
          }
        });

        await notifyMultipleDeliveryBoys(populatedOrder, priorityIds, 'priority');
        
        console.log(`✅ Resent notification to ${priorityIds.length} priority delivery partners for order ${order.orderId}`);

        return successResponse(res, 200, `Notification sent to ${priorityIds.length} delivery partners`, {
          order: populatedOrder,
          notifiedCount: priorityIds.length
        });
      }
    }

    return errorResponse(res, 500, 'Failed to send notification');
  } catch (error) {
    console.error('Error resending delivery notification:', error);
    return errorResponse(res, 500, `Failed to resend notification: ${error.message}`);
  }
});
