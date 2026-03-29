import Order from '../models/Order.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { getDeliveryCODSummary } from '../../delivery/services/codLimitService.js';
import { notifyDeliveryBoyNewOrder } from '../services/deliveryNotificationService.js';
import etaEventService from '../services/etaEventService.js';

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

  // Atomic claim: only assign if still unassigned and in assignable state.
  const assignedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $in: ['preparing', 'ready'] },
      $or: [{ deliveryPartnerId: { $exists: false } }, { deliveryPartnerId: null }],
    },
    {
      $set: {
        deliveryPartnerId: deliveryPartner._id,
        'assignmentInfo.deliveryPartnerId': String(deliveryPartner._id),
        'assignmentInfo.assignedAt': new Date(),
        'assignmentInfo.assignedBy': 'manual',
      },
    },
    { new: true },
  ).lean();

  if (!assignedOrder) {
    return errorResponse(
      res,
      409,
      'Order is no longer assignable. It may have been assigned already or status changed.',
    );
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
    codLimit: codSummary.codLimit,
    cashCollected: codSummary.cashCollected,
    remainingLimit: codSummary.remainingLimit,
  });
});
