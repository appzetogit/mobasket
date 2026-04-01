import Order from '../models/Order.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { getDeliveryCODSummary } from '../../delivery/services/codLimitService.js';
import { notifyDeliveryBoyNewOrder } from '../services/deliveryNotificationService.js';
import etaEventService from '../services/etaEventService.js';

const hasAcceptedRider = (order = null) => {
  const deliveryStateStatus = String(order?.deliveryState?.status || '').toLowerCase();
  const notificationPhase = String(order?.assignmentInfo?.notificationPhase || '').toLowerCase();

  return Boolean(
    order?.deliveryState?.acceptedAt ||
    ['accepted', 'en_route_to_pickup', 'at_pickup', 'en_route_to_delivery', 'at_delivery', 'completed'].includes(deliveryStateStatus) ||
    String(order?.assignmentInfo?.assignedBy || '').toLowerCase() === 'delivery_accept' ||
    notificationPhase === 'accepted' ||
    ['out_for_delivery', 'delivered'].includes(String(order?.status || '').toLowerCase())
  );
};

const emitOrderUnavailableToDeliveryPartner = async (deliveryPartnerId, order) => {
  if (!deliveryPartnerId || !order?._id) return;

  try {
    const serverModule = await import('../../../server.js');
    const io = serverModule.getIO ? serverModule.getIO() : null;
    const deliveryNamespace = io?.of('/delivery');
    if (!deliveryNamespace) return;

    deliveryNamespace.to(`delivery:${String(deliveryPartnerId)}`).emit('order_unavailable', {
      orderId: order.orderId,
      orderMongoId: order._id?.toString?.() || order._id,
      reason: 'reassigned_by_admin',
    });
  } catch (emitError) {
    console.error(
      `Failed to emit order_unavailable to previous delivery partner ${deliveryPartnerId} for order ${order.orderId}:`,
      emitError,
    );
  }
};

/**
 * Assign order to delivery partner (manual assignment) with COD-limit validation.
 * POST /api/admin/orders/assign
 */
export const assignOrder = asyncHandler(async (req, res) => {
  const candidate = req.assignmentCandidate;
  if (!candidate?.order || !candidate?.deliveryPartner) {
    return errorResponse(res, 400, 'Assignment candidate context is missing');
  }

  const { order, deliveryPartner } = candidate;
  const previousDeliveryPartnerId = order?.deliveryPartnerId ? String(order.deliveryPartnerId) : '';
  const isAcceptedAlready = hasAcceptedRider(order);

  if (previousDeliveryPartnerId && isAcceptedAlready) {
    return errorResponse(res, 409, 'Order is already accepted by a delivery partner and cannot be reassigned.');
  }

  const normalizedNextDeliveryPartnerId = String(deliveryPartner._id);
  const isReassignment =
    Boolean(previousDeliveryPartnerId) && previousDeliveryPartnerId !== normalizedNextDeliveryPartnerId;

  // Atomic claim: allow assignment if still in assignable state and not already accepted by a rider.
  const assignedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $in: ['preparing', 'ready'] },
      $or: [
        { deliveryPartnerId: { $exists: false } },
        { deliveryPartnerId: null },
        { deliveryPartnerId: deliveryPartner._id },
        ...(isReassignment ? [{ deliveryPartnerId: order.deliveryPartnerId }] : []),
      ],
      'deliveryState.acceptedAt': { $exists: false },
      'deliveryState.status': { $nin: ['accepted', 'reached_pickup', 'order_confirmed', 'en_route_to_delivery', 'delivered'] },
      'assignmentInfo.assignedBy': { $ne: 'delivery_accept' },
      'assignmentInfo.notificationPhase': { $ne: 'accepted' },
    },
    {
      $set: {
        deliveryPartnerId: deliveryPartner._id,
        'assignmentInfo.deliveryPartnerId': normalizedNextDeliveryPartnerId,
        'assignmentInfo.assignedAt': new Date(),
        'assignmentInfo.assignedBy': 'manual',
        'assignmentInfo.acceptedFromNotification': false,
      },
      $unset: {
        'assignmentInfo.priorityDeliveryPartnerIds': '',
        'assignmentInfo.expandedDeliveryPartnerIds': '',
        'assignmentInfo.priorityNotifiedAt': '',
        'assignmentInfo.expandedNotifiedAt': '',
        'assignmentInfo.notificationPhase': '',
        'assignmentInfo.lastRejectedBy': '',
        'assignmentInfo.lastRejectedAt': '',
        'assignmentInfo.lastRejectionReason': '',
      },
      $pull: {
        'assignmentInfo.rejectedDeliveryPartnerIds': normalizedNextDeliveryPartnerId,
      },
    },
    { new: true },
  ).lean();

  if (!assignedOrder) {
    return errorResponse(
      res,
      409,
      'Order is no longer assignable. It may have already been accepted or the status changed.',
    );
  }

  if (isReassignment && previousDeliveryPartnerId) {
    await emitOrderUnavailableToDeliveryPartner(previousDeliveryPartnerId, assignedOrder);
  }

  try {
    await notifyDeliveryBoyNewOrder(assignedOrder, deliveryPartner._id);
  } catch (notifyError) {
    console.error(`Failed to notify manually assigned delivery partner ${deliveryPartner._id} for order ${assignedOrder.orderId}:`, notifyError);
  }

  try {
    await etaEventService.handleRiderAssigned(assignedOrder._id.toString(), deliveryPartner._id.toString());
  } catch (etaError) {
    console.error(`Failed to emit ETA rider-assigned event for order ${assignedOrder.orderId}:`, etaError);
  }

  const codSummary = await getDeliveryCODSummary(deliveryPartner._id);

  return successResponse(res, 200, 'Order assigned successfully', {
    order: {
      id: assignedOrder._id,
      orderId: assignedOrder.orderId,
      status: assignedOrder.status,
      deliveryPartnerId: assignedOrder.deliveryPartnerId,
    },
    deliveryPartner: {
      id: deliveryPartner._id,
      name: deliveryPartner.name,
    },
    reassigned: isReassignment,
    previousDeliveryPartnerId: isReassignment ? previousDeliveryPartnerId : null,
    codLimit: codSummary.codLimit,
    cashCollected: codSummary.cashCollected,
    remainingLimit: codSummary.remainingLimit,
  });
});
