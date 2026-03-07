import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Order from '../../order/models/Order.js';
import Payment from '../../payment/models/Payment.js';
import mongoose from 'mongoose';

/**
 * Get all orders for grocery store
 * GET /api/grocery/store/orders
 * Reuses the same logic as restaurant orders since both use the Restaurant model
 */
export const getGroceryStoreOrders = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // From groceryStoreAuth middleware
    const { status, page = 1, limit = 50 } = req.query;

    // Get store ID - normalize to string (Order.restaurantId is String type)
    const storeIdString = store._id?.toString() ||
      store.restaurantId?.toString() ||
      store.id?.toString();

    if (!storeIdString) {
      console.error('❌ No store ID found:', store);
      return errorResponse(res, 500, 'Store ID not found');
    }

    // Query orders by restaurantId (stored as String in Order model)
    // Try multiple restaurantId formats to handle different storage formats
    const storeIdVariations = [storeIdString];
    
    // Also add ObjectId string format if valid (both directions)
    if (mongoose.Types.ObjectId.isValid(storeIdString)) {
      const objectIdString = new mongoose.Types.ObjectId(storeIdString).toString();
      if (!storeIdVariations.includes(objectIdString)) {
        storeIdVariations.push(objectIdString);
      }
      
      // Also try the original ObjectId if storeIdString is already a string
      try {
        const objectId = new mongoose.Types.ObjectId(storeIdString);
        const objectIdStr = objectId.toString();
        if (!storeIdVariations.includes(objectIdStr)) {
          storeIdVariations.push(objectIdStr);
        }
      } catch (e) {
        // Ignore if not a valid ObjectId
      }
    }
    
    // Also try direct match without ObjectId conversion
    storeIdVariations.push(storeIdString);

    // Build query - search for orders with any matching restaurantId variation
    // Use $in for multiple variations and also try direct match as fallback
    const query = {
      $or: [
        { restaurantId: { $in: storeIdVariations } },
        // Direct match fallback
        { restaurantId: storeIdString }
      ]
    };

    // If status filter is provided, add it to query
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔍 Fetching orders for grocery store:', {
      storeId: storeIdString,
      store_id: store._id?.toString(),
      storeIdVariations: storeIdVariations,
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
    console.error('Error fetching grocery store orders:', error);
    return errorResponse(res, 500, 'Failed to fetch orders');
  }
});

/**
 * Get order by ID for grocery store
 * GET /api/grocery/store/orders/:id
 */
export const getGroceryStoreOrderById = asyncHandler(async (req, res) => {
  try {
    const store = req.store;
    const { id } = req.params;

    const storeIdVariations = Array.from(new Set([
      store._id?.toString(),
      store.restaurantId?.toString(),
      store.id?.toString(),
    ].filter(Boolean)));

    let order = null;

    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: storeIdVariations }
      })
        .populate('userId', 'name email phone')
        .lean();
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: storeIdVariations }
      })
        .populate('userId', 'name email phone')
        .lean();
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    return successResponse(res, 200, 'Order retrieved successfully', { order });
  } catch (error) {
    console.error('Error fetching grocery store order:', error);
    return errorResponse(res, 500, 'Failed to fetch order');
  }
});

/**
 * Accept order for grocery store
 * PATCH /api/grocery/store/orders/:id/accept
 * Adapts restaurant acceptOrder to work with req.store
 */
export const acceptOrder = asyncHandler(async (req, res) => {
  // Temporarily set req.restaurant to req.store for compatibility
  req.restaurant = req.store;
  // Import and call the restaurant controller function
  const { acceptOrder: restaurantAcceptOrder } = await import('../../restaurant/controllers/restaurantOrderController.js');
  return restaurantAcceptOrder(req, res);
});

/**
 * Reject order for grocery store
 * PATCH /api/grocery/store/orders/:id/reject
 */
export const rejectOrder = asyncHandler(async (req, res) => {
  req.restaurant = req.store;
  const { rejectOrder: restaurantRejectOrder } = await import('../../restaurant/controllers/restaurantOrderController.js');
  return restaurantRejectOrder(req, res);
});

/**
 * Mark order as preparing for grocery store
 * PATCH /api/grocery/store/orders/:id/preparing
 */
export const markOrderPreparing = asyncHandler(async (req, res) => {
  req.restaurant = req.store;
  const { markOrderPreparing: restaurantMarkPreparing } = await import('../../restaurant/controllers/restaurantOrderController.js');
  return restaurantMarkPreparing(req, res);
});

/**
 * Mark order as ready for grocery store
 * PATCH /api/grocery/store/orders/:id/ready
 */
export const markOrderReady = asyncHandler(async (req, res) => {
  req.restaurant = req.store;
  const { markOrderReady: restaurantMarkReady } = await import('../../restaurant/controllers/restaurantOrderController.js');
  return restaurantMarkReady(req, res);
});

/**
 * Resend delivery notification for grocery store
 * POST /api/grocery/store/orders/:id/resend-delivery-notification
 */
export const resendDeliveryNotification = asyncHandler(async (req, res) => {
  req.restaurant = req.store;
  const { resendDeliveryNotification: restaurantResendNotification } = await import('../../restaurant/controllers/resendDeliveryNotification.js');
  return restaurantResendNotification(req, res);
});
