import Order from '../../order/models/Order.js';
import Payment from '../../payment/models/Payment.js';
import Restaurant from '../models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { notifyRestaurantOrderUpdate } from '../../order/services/restaurantNotificationService.js';
import { assignOrderToDeliveryBoy, findNearestDeliveryBoys, findNearestDeliveryBoy } from '../../order/services/deliveryAssignmentService.js';
import { notifyDeliveryBoyNewOrder, notifyMultipleDeliveryBoys } from '../../order/services/deliveryNotificationService.js';
import { restoreGroceryStockForOrder } from '../../order/services/groceryStockService.js';
import mongoose from 'mongoose';

const emitOrderTrackingUpdate = async (orderLike, payload = {}) => {
  try {
    const serverModule = await import('../../../server.js');
    const getIO = serverModule.getIO;
    const io = getIO ? getIO() : null;
    if (!io) return;

    const aliases = Array.from(new Set([
      orderLike?._id?.toString?.(),
      orderLike?._id,
      orderLike?.id,
      orderLike?.orderId
    ].filter(Boolean).map((value) => String(value))));

    if (aliases.length === 0) return;

    aliases.forEach((alias) => {
      io.to(`order:${alias}`).emit('order_status_update', {
        orderId: orderLike?.orderId || alias,
        ...payload
      });
    });
  } catch (emitError) {
    console.warn(`Failed to emit order tracking update: ${emitError.message}`);
  }
};

const hasValidStoreCoordinates = (store) =>
  Boolean(
    store?.location?.coordinates &&
    store.location.coordinates.length >= 2 &&
    Number.isFinite(Number(store.location.coordinates[0])) &&
    Number.isFinite(Number(store.location.coordinates[1])) &&
    !(Number(store.location.coordinates[0]) === 0 && Number(store.location.coordinates[1]) === 0)
  );

const resolveStoreForAssignment = async (storeIdentifier) => {
  const normalized = String(storeIdentifier || '').trim();
  if (!normalized) return null;

  const projection = 'name location restaurantId slug';

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    const byRestaurantId = await Restaurant.findById(normalized).select(projection).lean();
    if (byRestaurantId) return byRestaurantId;

    const byGroceryStoreId = await GroceryStore.findById(normalized).select(projection).lean();
    if (byGroceryStoreId) return byGroceryStoreId;
  }

  const byRestaurantIdentifier = await Restaurant.findOne({
    $or: [{ restaurantId: normalized }, { slug: normalized }]
  })
    .select(projection)
    .lean();
  if (byRestaurantIdentifier) return byRestaurantIdentifier;

  const byGroceryIdentifier = await GroceryStore.findOne({
    $or: [{ restaurantId: normalized }, { slug: normalized }]
  })
    .select(projection)
    .lean();
  if (byGroceryIdentifier) return byGroceryIdentifier;

  return null;
};

const buildRestaurantIdVariations = (restaurant) => {
  const variations = new Set();

  [restaurant?._id, restaurant?.restaurantId, restaurant?.id, restaurant?.slug].forEach((value) => {
    const normalized = String(value || '').trim();
    if (normalized) {
      variations.add(normalized);
    }
  });

  return Array.from(variations);
};

/**
 * Get all orders for restaurant
 * GET /api/restaurant/orders
 */
export const getRestaurantOrders = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { status, page = 1, limit = 50 } = req.query;

    // Get restaurant ID - normalize to string (Order.restaurantId is String type)
    const restaurantIdString = restaurant._id?.toString() ||
      restaurant.restaurantId?.toString() ||
      restaurant.id?.toString() ||
      restaurant.slug?.toString();

    if (!restaurantIdString) {
      console.error('❌ No restaurant ID found:', restaurant);
      return errorResponse(res, 500, 'Restaurant ID not found');
    }

    // Query orders by restaurantId (stored as String in Order model)
    // Try multiple identifier formats to handle legacy/alias values.
    const restaurantIdVariations = buildRestaurantIdVariations(restaurant);
    
    // Also add ObjectId string format if valid (both directions)
    if (mongoose.Types.ObjectId.isValid(restaurantIdString)) {
      const objectIdString = new mongoose.Types.ObjectId(restaurantIdString).toString();
      if (!restaurantIdVariations.includes(objectIdString)) {
        restaurantIdVariations.push(objectIdString);
      }
      
      // Also try the original ObjectId if restaurantIdString is already a string
      try {
        const objectId = new mongoose.Types.ObjectId(restaurantIdString);
        const objectIdStr = objectId.toString();
        if (!restaurantIdVariations.includes(objectIdStr)) {
          restaurantIdVariations.push(objectIdStr);
        }
      } catch (e) {
        // Ignore if not a valid ObjectId
      }
    }
    
    // Also try direct match without ObjectId conversion
    if (!restaurantIdVariations.includes(restaurantIdString)) {
      restaurantIdVariations.push(restaurantIdString);
    }

    // Build query - search for orders with any matching restaurantId variation
    // Use $in for multiple variations and also try direct match as fallback
    const query = {
      $or: [
        { restaurantId: { $in: restaurantIdVariations } },
        // Direct match fallback
        { restaurantId: restaurantIdString }
      ]
    };

    // If status filter is provided, add it to query
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔍 Fetching orders for restaurant:', {
      restaurantId: restaurantIdString,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId,
      restaurantIdVariations: restaurantIdVariations,
      query: JSON.stringify(query),
      status: status || 'all'
    });

    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Order.countDocuments(query);

    // Resolve paymentMethod: order.payment.method or Payment collection (COD fallback)
    const orderIds = orders.map(o => o._id);
    const codOrderIds = new Set();
    try {
      const codPayments = await Payment.find({ orderId: { $in: orderIds }, method: 'cash' }).select('orderId').lean();
      codPayments.forEach(p => codOrderIds.add(p.orderId?.toString()));
    } catch (e) { /* ignore */ }
    const ordersWithPaymentMethod = orders.map(o => {
      let paymentMethod = o.payment?.method ?? 'razorpay';
      if (paymentMethod !== 'cash' && codOrderIds.has(o._id?.toString())) paymentMethod = 'cash';
      return { ...o, paymentMethod };
    });

    // Log detailed order info for debugging
    console.log('✅ Found orders:', {
      count: orders.length,
      total,
      restaurantId: restaurantIdString,
      queryUsed: JSON.stringify(query),
      orders: orders.map(o => ({ 
        orderId: o.orderId, 
        status: o.status, 
        restaurantId: o.restaurantId,
        restaurantIdType: typeof o.restaurantId,
        createdAt: o.createdAt
      }))
    });
    
    // If no orders found, log a warning with more details
    if (orders.length === 0 && total === 0) {
      console.warn('⚠️ No orders found for restaurant:', {
        restaurantId: restaurantIdString,
        restaurant_id: restaurant._id?.toString(),
        variationsTried: restaurantIdVariations,
        query: JSON.stringify(query)
      });
      
      // Try to find ANY orders in database for debugging
      const allOrdersCount = await Order.countDocuments({});
      console.log(`📊 Total orders in database: ${allOrdersCount}`);
      
      // Check if orders exist with similar restaurantId
      const sampleOrders = await Order.find({}).limit(5).select('orderId restaurantId status').lean();
      if (sampleOrders.length > 0) {
        console.log('📊 Sample orders in database (first 5):', sampleOrders.map(o => ({
          orderId: o.orderId,
          restaurantId: o.restaurantId,
          restaurantIdType: typeof o.restaurantId,
          status: o.status
        })));
      }
    }

    return successResponse(res, 200, 'Orders retrieved successfully', {
      orders: ordersWithPaymentMethod,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant orders:', error);
    return errorResponse(res, 500, 'Failed to fetch orders');
  }
});

/**
 * Get order by ID
 * GET /api/restaurant/orders/:id
 */
export const getRestaurantOrderById = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;
    const restaurantIdVariations = buildRestaurantIdVariations(restaurant);

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      })
        .populate('userId', 'name email phone')
        .lean();
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      })
        .populate('userId', 'name email phone')
        .lean();
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }
    const orderStoreIdentifier = String(order?.restaurantId || restaurantId || '').trim() || restaurantId;
    return successResponse(res, 200, 'Order retrieved successfully', {
      order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    return errorResponse(res, 500, 'Failed to fetch order');
  }
});

/**
 * Accept order
 * PATCH /api/restaurant/orders/:id/accept
 */
export const acceptOrder = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;
    const { preparationTime } = req.body;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    // Prepare restaurantId variations for query (handle both _id and restaurantId formats)
    const restaurantIdVariations = buildRestaurantIdVariations(restaurant);

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }
    const orderStoreIdentifier = String(order?.restaurantId || restaurantId || '').trim() || restaurantId;

    // Accept should be idempotent from the restaurant UI.
    // Stale popups or a second click can hit this endpoint after the order already moved
    // to preparing/ready, and that should be treated as a successful accept.
    const alreadyAcceptedStatuses = ['preparing', 'ready'];
    const wasAlreadyAccepted = alreadyAcceptedStatuses.includes(order.status);

    if (!wasAlreadyAccepted) {
      // Allow accepting orders with status 'pending' or 'confirmed'
      // 'confirmed' status means payment is verified, restaurant can still accept
      if (!['pending', 'confirmed'].includes(order.status)) {
        return errorResponse(res, 400, `Order cannot be accepted. Current status: ${order.status}`);
      }

    // When restaurant accepts order, it means they're starting to prepare it
    // So set status to 'preparing' and mark as confirmed if it was pending
    if (order.status === 'pending') {
      order.tracking.confirmed = { status: true, timestamp: new Date() };
    }

    // Set status to 'preparing' when restaurant accepts
    order.status = 'preparing';
    order.tracking.preparing = { status: true, timestamp: new Date() };

    // Handle preparation time update from restaurant
    if (preparationTime) {
      const restaurantPrepTime = parseInt(preparationTime, 10);
      const initialPrepTime = order.preparationTime || 0;
      
      // Calculate additional time restaurant is adding
      const additionalTime = Math.max(0, restaurantPrepTime - initialPrepTime);
      
      // Update ETA with additional time (add to both min and max)
      if (order.eta) {
        const currentMin = order.eta.min || 0;
        const currentMax = order.eta.max || 0;
        
        order.eta.min = currentMin + additionalTime;
        order.eta.max = currentMax + additionalTime;
        order.eta.additionalTime = (order.eta.additionalTime || 0) + additionalTime;
        order.eta.lastUpdated = new Date();
        
        // Update estimated delivery time to average of new min and max
        order.estimatedDeliveryTime = Math.ceil((order.eta.min + order.eta.max) / 2);
      } else {
        // If ETA doesn't exist, create it
        order.eta = {
          min: (order.estimatedDeliveryTime || 30) + additionalTime,
          max: (order.estimatedDeliveryTime || 30) + additionalTime,
          additionalTime: additionalTime,
          lastUpdated: new Date()
        };
        order.estimatedDeliveryTime = Math.ceil((order.eta.min + order.eta.max) / 2);
      }
      
      console.log(`📋 Restaurant updated preparation time:`, {
        initialPrepTime,
        restaurantPrepTime,
        additionalTime,
        newETA: order.eta,
        newEstimatedDeliveryTime: order.estimatedDeliveryTime
      });
    }

    await order.save();

    // Trigger ETA recalculation for restaurant accepted event
    try {
      const etaEventService = (await import('../../order/services/etaEventService.js')).default;
      await etaEventService.handleRestaurantAccepted(order._id.toString(), new Date());
      console.log(`✅ ETA updated after restaurant accepted order ${order.orderId}`);
    } catch (etaError) {
      console.error('Error updating ETA after restaurant accept:', etaError);
      // Continue even if ETA update fails
    }

    // Notify about status update
    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), 'preparing');
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

      // Notify user tracking room that restaurant accepted the order
      try {
        await emitOrderTrackingUpdate(order, {
          status: 'preparing',
          message: 'Restaurant accepted your order'
        });
      } catch (userNotifError) {
        console.error('Error sending user accepted notification:', userNotifError);
      }
    } else {
      console.log(`ℹ️ Order ${order.orderId} already in accepted state (${order.status}), re-running rider dispatch sync.`);
    }

    // Fire delivery assignment/notification asynchronously so accept API responds fast.
    // The order state is already saved above; this background task only improves dispatch speed.
    const acceptedOrderSnapshot = {
      _id: order?._id,
      orderId: order?.orderId,
      deliveryPartnerId: order?.deliveryPartnerId,
      status: order?.status,
    };

    void (async () => {
      try {
        const latestOrderForNotify = await Order.findById(acceptedOrderSnapshot._id).lean();
        if (!latestOrderForNotify) return;

        if (latestOrderForNotify.deliveryPartnerId) {
          const assignedOrder = await Order.findById(latestOrderForNotify._id)
            .populate('userId', 'name phone')
            .populate('restaurantId', 'name address location phone ownerPhone')
            .lean();

          if (assignedOrder) {
            await notifyDeliveryBoyNewOrder(assignedOrder, latestOrderForNotify.deliveryPartnerId);
          }
          return;
        }

        if (!['preparing', 'ready'].includes(String(latestOrderForNotify.status || '').toLowerCase())) {
          return;
        }

        const { notifyDeliveryPartnersForOrder } = await import('./resendDeliveryNotification.js');
        await notifyDeliveryPartnersForOrder({
          order: latestOrderForNotify,
          restaurant,
          assignedBy: 'accept_auto_notify',
        });
      } catch (acceptDispatchError) {
        console.error(`Failed async accept dispatch for order ${acceptedOrderSnapshot.orderId || acceptedOrderSnapshot._id}:`, acceptDispatchError);
      }
    })();

    return successResponse(res, 200, wasAlreadyAccepted ? 'Order already accepted' : 'Order accepted successfully', {
      order
    });
  } catch (error) {
    console.error('Error accepting order:', error);
    return errorResponse(res, 500, 'Failed to accept order');
  }
});

/**
 * Reject order
 * PATCH /api/restaurant/orders/:id/reject
 */
export const rejectOrder = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;
    const { reason } = req.body;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    // Log for debugging
    console.log('🔍 Reject order - Looking up order:', {
      orderIdParam: id,
      restaurantId: restaurantId,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId
    });

    // Prepare restaurantId variations for query (handle both _id and restaurantId formats)
    const restaurantIdVariations = buildRestaurantIdVariations(restaurant);

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      });
      console.log('🔍 Order lookup by _id:', {
        orderId: id,
        found: !!order,
        orderRestaurantId: order?.restaurantId
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      });
      console.log('🔍 Order lookup by orderId:', {
        orderId: id,
        found: !!order,
        orderRestaurantId: order?.restaurantId,
        restaurantIdVariations
      });
    }

    if (!order) {
      console.error('❌ Order not found for rejection:', {
        orderIdParam: id,
        restaurantId: restaurantId,
        restaurantIdVariations,
        restaurant_id: restaurant._id?.toString(),
        restaurant_restaurantId: restaurant.restaurantId
      });
      return errorResponse(res, 404, 'Order not found');
    }

    console.log('✅ Order found for rejection:', {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      orderRestaurantId: order.restaurantId,
      orderStatus: order.status
    });

    // Allow rejecting/cancelling orders with status 'pending', 'confirmed', or 'preparing'
    if (!['pending', 'confirmed', 'preparing'].includes(order.status)) {
      return errorResponse(res, 400, `Order cannot be cancelled. Current status: ${order.status}`);
    }

    order.status = 'cancelled';
    order.cancellationReason = reason || 'Cancelled by restaurant';
    order.cancelledBy = 'restaurant';
    order.cancelledAt = new Date();
    await order.save();
    await restoreGroceryStockForOrder(order);

    // Calculate refund amount but don't process automatically
    // Admin will process refund manually via refund button
    try {
      const { calculateCancellationRefund } = await import('../../order/services/cancellationRefundService.js');
      await calculateCancellationRefund(order._id, reason || 'Rejected by restaurant');
      console.log(`✅ Cancellation refund calculated for order ${order.orderId} - awaiting admin approval`);
    } catch (refundError) {
      console.error(`❌ Error calculating cancellation refund for order ${order.orderId}:`, refundError);
      // Don't fail order cancellation if refund calculation fails
      // But log it for investigation
    }

    // Notify about status update
    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), 'cancelled');
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    // Notify user tracking room that restaurant cancelled the order
    try {
      await emitOrderTrackingUpdate(order, {
        status: 'cancelled',
        message: 'Restaurant cancelled your order'
      });
    } catch (userNotifError) {
      console.error('Error sending user cancellation notification:', userNotifError);
    }

    return successResponse(res, 200, 'Order rejected successfully', {
      order
    });
  } catch (error) {
    console.error('Error rejecting order:', error);
    return errorResponse(res, 500, 'Failed to reject order');
  }
});

/**
 * Update order status to preparing
 * PATCH /api/restaurant/orders/:id/preparing
 */
export const markOrderPreparing = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;
    const restaurantIdVariations = buildRestaurantIdVariations(restaurant);

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }
    const orderStoreIdentifier = String(order?.restaurantId || restaurantId || '').trim() || restaurantId;

    // Allow marking as preparing if status is 'confirmed', 'pending', or already 'preparing' (for retry scenarios)
    // If already preparing, we allow it to retry delivery assignment if no delivery partner is assigned
    const allowedStatuses = ['confirmed', 'pending', 'preparing'];
    if (!allowedStatuses.includes(order.status)) {
      return errorResponse(res, 400, `Order cannot be marked as preparing. Current status: ${order.status}`);
    }

    // Only update status if it's not already preparing
    // If already preparing, we're just retrying delivery assignment
    const wasAlreadyPreparing = order.status === 'preparing';
    if (!wasAlreadyPreparing) {
      order.status = 'preparing';
      order.tracking.preparing = { status: true, timestamp: new Date() };
      await order.save();
    }

    // Notify about status update only if status actually changed
    if (!wasAlreadyPreparing) {
      try {
        await notifyRestaurantOrderUpdate(order._id.toString(), 'preparing');
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
      }
    }

    // CRITICAL: Don't assign delivery partner if order is cancelled
    if (false && freshOrder.status === 'cancelled') {
      console.log(`⚠️ Order ${freshOrder.orderId} is cancelled. Cannot assign delivery partner.`);
      return successResponse(res, 200, 'Order is cancelled. Cannot assign delivery partner.', {
        order: freshOrder
      });
    }

    // Assign order to nearest delivery boy and notify them (if not already assigned)
    // This is critical - even if order is already preparing, we need to assign delivery partner
    // Reload order first to get the latest state (in case it was updated elsewhere)
    let freshOrder = await Order.findById(order._id);
    if (!freshOrder) {
      console.error(`❌ Order ${order.orderId} not found after save`);
      return errorResponse(res, 404, 'Order not found after update');
    }

    // CRITICAL: Don't assign delivery partner if order is cancelled
    if (freshOrder.status === 'cancelled') {
      console.log(`⚠️ Order ${freshOrder.orderId} is cancelled. Cannot assign delivery partner.`);
      return successResponse(res, 200, 'Order is cancelled. Cannot assign delivery partner.', {
        order: freshOrder
      });
    }

    // Check if delivery partner is already assigned (after reload)
    if (!freshOrder.deliveryPartnerId) {
      try {
        console.log(`🔄 Attempting to assign order ${freshOrder.orderId} to delivery boy (status: ${freshOrder.status})...`);

        // Get restaurant location
        const restaurantDoc = await resolveStoreForAssignment(orderStoreIdentifier);

        if (!restaurantDoc) {
          console.error(`❌ Restaurant not found for restaurantId: ${restaurantId}`);
          return errorResponse(res, 500, 'Restaurant location not found. Cannot assign delivery partner.');
        }

        if (!restaurantDoc.location || !restaurantDoc.location.coordinates ||
          restaurantDoc.location.coordinates.length < 2 ||
          (restaurantDoc.location.coordinates[0] === 0 && restaurantDoc.location.coordinates[1] === 0)) {
          console.error(`❌ Restaurant location not found or invalid for restaurant ${restaurantId}`);
          return errorResponse(res, 500, 'Restaurant location is invalid. Please update restaurant location.');
        }

        const [restaurantLng, restaurantLat] = restaurantDoc.location.coordinates;
        console.log(`📍 Restaurant location: ${restaurantLat}, ${restaurantLng}`);

        // Check if order already has delivery partner assigned
        const orderCheck = await Order.findById(freshOrder._id).select('deliveryPartnerId');
        const isResendRequest = req.query.resend === 'true' || req.body.resend === true;

        // If order already has delivery partner and it's a resend request, resend notification to existing partner
        if (orderCheck && orderCheck.deliveryPartnerId && isResendRequest) {
          console.log(`🔄 Resend request detected - resending notification to existing delivery partner ${orderCheck.deliveryPartnerId}`);

          // Reload order with populated userId
          const populatedOrder = await Order.findById(freshOrder._id)
            .populate('userId', 'name phone')
            .lean();

          if (!populatedOrder) {
            console.error(`❌ Could not reload order ${freshOrder.orderId} for resend`);
            return errorResponse(res, 500, 'Could not reload order for resend');
          }

          // Resend notification to existing delivery partner
          try {
            await notifyDeliveryBoyNewOrder(populatedOrder, orderCheck.deliveryPartnerId);
            console.log(`✅ Resent notification to delivery partner ${orderCheck.deliveryPartnerId} for order ${freshOrder.orderId}`);

            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(res, 200, 'Notification resent to delivery partner', {
              order: finalOrder,
              resend: true,
              deliveryPartnerId: orderCheck.deliveryPartnerId
            });
          } catch (notifyError) {
            console.error(`❌ Error resending notification:`, notifyError);
            // Continue to try reassignment if notification fails
            console.log(`🔄 Notification failed, attempting to reassign to new delivery partner...`);
          }
        }

        // If order already has delivery partner and it's NOT a resend request, just return
        if (orderCheck && orderCheck.deliveryPartnerId && !isResendRequest) {
          console.log(`⚠️ Order ${freshOrder.orderId} was assigned delivery partner ${orderCheck.deliveryPartnerId} by another process`);
          // Reload full order for response
          const updatedOrder = await Order.findById(freshOrder._id);
          return successResponse(res, 200, 'Order marked as preparing', {
            order: updatedOrder
          });
        }

        // If resend request failed notification, or no partner assigned, try to assign/reassign
        // Clear existing assignment if resend request
        if (isResendRequest && orderCheck && orderCheck.deliveryPartnerId) {
          console.log(`🔄 Resend request - clearing existing delivery partner to allow reassignment`);
          freshOrder.deliveryPartnerId = null;
          freshOrder.assignmentInfo = undefined;
          await freshOrder.save();
          // Reload to get fresh state
          const reloadedOrder = await Order.findById(freshOrder._id);
          if (reloadedOrder) {
            freshOrder = reloadedOrder;
          }
        }

        // Assign to nearest delivery boy
        const assignmentResult = await assignOrderToDeliveryBoy(freshOrder, restaurantLat, restaurantLng, orderStoreIdentifier);

        if (assignmentResult && assignmentResult.deliveryPartnerId) {
          // Reload order with populated userId after assignment
          const populatedOrder = await Order.findById(freshOrder._id)
            .populate('userId', 'name phone')
            .lean();

          if (!populatedOrder) {
            console.error(`❌ Could not reload order ${freshOrder.orderId} after assignment`);
            return errorResponse(res, 500, 'Order assignment succeeded but could not reload order');
          } else {
            // Notify delivery boy about the new order
            try {
              await notifyDeliveryBoyNewOrder(populatedOrder, assignmentResult.deliveryPartnerId);
              console.log(`✅ Order ${freshOrder.orderId} assigned to delivery boy ${assignmentResult.deliveryPartnerId} and notification sent`);
            } catch (notifyError) {
              console.error(`❌ Error notifying delivery boy:`, notifyError);
              console.error(`❌ Notification error details:`, {
                message: notifyError.message,
                stack: notifyError.stack
              });
              // Assignment succeeded but notification failed - still return success but log error
              console.warn(`⚠️ Order assigned but notification failed. Delivery boy may need to refresh.`);
            }

            // Reload full order for response
            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(res, 200, 'Order marked as preparing and assigned to delivery partner', {
              order: finalOrder,
              assignment: assignmentResult
            });
          }
        } else {
          console.warn(`⚠️ Direct assignment failed for order ${freshOrder.orderId}. Falling back to immediate priority notifications.`);

          // Match accept flow behavior: notify priority riders immediately, then expand after 30s.
          const requiredZoneId = freshOrder?.assignmentInfo?.zoneId ? String(freshOrder.assignmentInfo.zoneId) : null;
          const incomingCodAmount = ['cash', 'cod'].includes(String(freshOrder?.payment?.method || '').toLowerCase())
            ? Math.max(0, Number(freshOrder?.pricing?.total) || 0)
            : 0;
          const priorityDeliveryBoys = await findNearestDeliveryBoys(
            restaurantLat,
            restaurantLng,
            orderStoreIdentifier,
            20,
            { requiredZoneId, incomingCodAmount }
          );

          if (priorityDeliveryBoys && priorityDeliveryBoys.length > 0) {
            const priorityIds = priorityDeliveryBoys.map((db) => db.deliveryPartnerId);
            freshOrder.assignmentInfo = {
              ...(freshOrder.assignmentInfo || {}),
              priorityNotifiedAt: new Date(),
              priorityDeliveryPartnerIds: priorityIds,
              notificationPhase: 'priority'
            };
            await freshOrder.save();

            const populatedOrder = await Order.findById(freshOrder._id)
              .populate('userId', 'name phone')
              .populate('restaurantId', 'name address location phone ownerPhone')
              .lean();

            if (populatedOrder) {
              await notifyMultipleDeliveryBoys(populatedOrder, priorityIds, 'priority');
            }

            setTimeout(async () => {
              try {
                const checkOrder = await Order.findById(freshOrder._id);
                if (!checkOrder || checkOrder.deliveryPartnerId) return;

                const allDeliveryBoys = await findNearestDeliveryBoys(
                  restaurantLat,
                  restaurantLng,
                  orderStoreIdentifier,
                  50,
                  { requiredZoneId, incomingCodAmount }
                );
                const expandedDeliveryBoys = allDeliveryBoys.filter(
                  (db) => !priorityIds.includes(db.deliveryPartnerId)
                );
                if (!expandedDeliveryBoys.length) return;

                const expandedIds = expandedDeliveryBoys.map((db) => db.deliveryPartnerId);
                checkOrder.assignmentInfo = {
                  ...(checkOrder.assignmentInfo || {}),
                  expandedNotifiedAt: new Date(),
                  expandedDeliveryPartnerIds: expandedIds,
                  notificationPhase: 'expanded'
                };
                await checkOrder.save();

                const expandedOrder = await Order.findById(checkOrder._id)
                  .populate('userId', 'name phone')
                  .populate('restaurantId', 'name address location phone ownerPhone')
                  .lean();

                if (expandedOrder) {
                  await notifyMultipleDeliveryBoys(expandedOrder, expandedIds, 'expanded');
                }
              } catch (expandError) {
                console.error(`❌ Error in expanded notification for order ${freshOrder.orderId}:`, expandError);
              }
            }, 30000);

            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(res, 200, 'Order marked as preparing and notified to delivery partners', {
              order: finalOrder,
              notifiedCount: priorityIds.length
            });
          }

          const anyDeliveryBoy = await findNearestDeliveryBoy(
            restaurantLat,
            restaurantLng,
            orderStoreIdentifier,
            50,
            [],
            { requiredZoneId, incomingCodAmount }
          );
          if (anyDeliveryBoy) {
            const populatedOrder = await Order.findById(freshOrder._id)
              .populate('userId', 'name phone')
              .populate('restaurantId', 'name address location phone ownerPhone')
              .lean();
            if (populatedOrder) {
              await notifyMultipleDeliveryBoys(populatedOrder, [anyDeliveryBoy.deliveryPartnerId], 'immediate');
            }
            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(res, 200, 'Order marked as preparing and notified to delivery partner', {
              order: finalOrder,
              notifiedCount: 1
            });
          }

          const finalOrder = await Order.findById(freshOrder._id);
          return successResponse(res, 200, 'Order marked as preparing, but no delivery partners available', {
            order: finalOrder,
            warning: 'No delivery partners available. Order will be assigned when a delivery partner comes online.'
          });
        }
      } catch (assignmentError) {
        console.error('❌ Error assigning order to delivery boy:', assignmentError);
        console.error('❌ Error stack:', assignmentError.stack);
        // Return error so restaurant knows assignment failed
        const finalOrder = await Order.findById(freshOrder._id);
        return errorResponse(res, 500, `Order marked as preparing, but delivery assignment failed: ${assignmentError.message}`, {
          order: finalOrder
        });
      }
    } else {
      console.log(`ℹ️ Order ${freshOrder.orderId} already has delivery partner assigned: ${freshOrder.deliveryPartnerId}`);
      // Ensure assigned rider still receives notification from preparing flow.
      try {
        const populatedOrder = await Order.findById(freshOrder._id)
          .populate('userId', 'name phone')
          .populate('restaurantId', 'name address location phone ownerPhone')
          .lean();
        if (populatedOrder) {
          await notifyDeliveryBoyNewOrder(populatedOrder, freshOrder.deliveryPartnerId);
        }
      } catch (assignedNotifyError) {
        console.error(`❌ Failed to notify assigned delivery partner for order ${freshOrder.orderId}:`, assignedNotifyError);
      }
      // Reload full order for response
      const finalOrder = await Order.findById(freshOrder._id);
      return successResponse(res, 200, 'Order marked as preparing', {
        order: finalOrder
      });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    return errorResponse(res, 500, 'Failed to update order status');
  }
});

/**
 * Update order status to ready
 * PATCH /api/restaurant/orders/:id/ready
 */
export const markOrderReady = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;
    const restaurantIdVariations = buildRestaurantIdVariations(restaurant);

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    if (order.status !== 'preparing') {
      return errorResponse(res, 400, `Order cannot be marked as ready. Current status: ${order.status}`);
    }

    const now = new Date();
    const updatedOrderDoc = await Order.findOneAndUpdate(
      {
        _id: order._id,
        restaurantId: { $in: restaurantIdVariations },
        status: 'preparing'
      },
      {
        $set: {
          status: 'ready',
          'tracking.ready': {
            status: true,
            timestamp: now
          }
        }
      },
      { new: true }
    );

    if (!updatedOrderDoc) {
      return errorResponse(res, 409, 'Order was already updated to ready by another process');
    }

    // Populate order for notifications
    const populatedOrder = await Order.findById(updatedOrderDoc._id)
      .populate('restaurantId', 'name location address phone')
      .populate('userId', 'name phone')
      .populate('deliveryPartnerId', 'name phone')
      .lean();

    try {
      await notifyRestaurantOrderUpdate(updatedOrderDoc._id.toString(), 'ready');
    } catch (notifError) {
      console.error('Error sending restaurant notification:', notifError);
    }

    try {
      await emitOrderTrackingUpdate(updatedOrderDoc, {
        status: 'ready',
        message: 'Your food is ready'
      });
    } catch (userNotifError) {
      console.error('Error sending user ready notification:', userNotifError);
    }

    // Notify delivery boy that order is ready for pickup
    if (populatedOrder.deliveryPartnerId) {
      try {
        const { notifyDeliveryBoyOrderReady } = await import('../../order/services/deliveryNotificationService.js');
        const deliveryPartnerId = populatedOrder.deliveryPartnerId._id || populatedOrder.deliveryPartnerId;
        await notifyDeliveryBoyOrderReady(populatedOrder, deliveryPartnerId);
        console.log(`✅ Order ready notification sent to delivery partner ${deliveryPartnerId}`);
      } catch (deliveryNotifError) {
        console.error('Error sending delivery boy notification:', deliveryNotifError);
      }
    } else {
      try {
        const { notifyDeliveryPartnersForOrder } = await import('./resendDeliveryNotification.js');
        const notifyResult = await notifyDeliveryPartnersForOrder({
          order: updatedOrderDoc,
          restaurant,
          assignedBy: 'ready_auto_notify',
        });

        if (!notifyResult.success) {
          console.warn(`Ready auto-notify skipped for order ${updatedOrderDoc.orderId}: ${notifyResult.message}`);
        } else {
          console.log(`Ready auto-notify sent to ${notifyResult.notifiedCount} delivery partners for order ${updatedOrderDoc.orderId}`);
        }
      } catch (readyNotifyError) {
        console.error(`Failed ready auto-notify for order ${updatedOrderDoc.orderId}:`, readyNotifyError);
      }
    }

    return successResponse(res, 200, 'Order marked as ready', {
      order: populatedOrder || order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    return errorResponse(res, 500, 'Failed to update order status');
  }
});

/**
 * Resend delivery notification for unassigned order
 * POST /api/restaurant/orders/:id/resend-delivery-notification
 */
export const resendDeliveryNotification = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;
    const restaurantIdVariations = buildRestaurantIdVariations(restaurant);

    // Try to find order by MongoDB _id or orderId
    let order = null;

    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Check if order is in valid status (preparing or ready)
    if (!['preparing', 'ready'].includes(order.status)) {
      return errorResponse(res, 400, `Cannot resend notification. Order status must be 'preparing' or 'ready'. Current status: ${order.status}`);
    }

    // Get restaurant location
    const restaurantDoc = await resolveStoreForAssignment(orderStoreIdentifier);

    if (!restaurantDoc || !restaurantDoc.location || !restaurantDoc.location.coordinates) {
      return errorResponse(res, 400, 'Restaurant location not found. Please update restaurant location.');
    }

    const [restaurantLng, restaurantLat] = restaurantDoc.location.coordinates;

    // Find nearest delivery boys
    const requiredZoneId = order?.assignmentInfo?.zoneId ? String(order.assignmentInfo.zoneId) : null;
    const priorityDeliveryBoys = await findNearestDeliveryBoys(
      restaurantLat,
      restaurantLng,
      orderStoreIdentifier,
      20, // 20km radius for priority
      { requiredZoneId }
    );

    if (!priorityDeliveryBoys || priorityDeliveryBoys.length === 0) {
      // Try with larger radius
      const allDeliveryBoys = await findNearestDeliveryBoys(
        restaurantLat,
        restaurantLng,
        orderStoreIdentifier,
        50, // 50km radius
        { requiredZoneId }
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
