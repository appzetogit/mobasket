import Order from '../models/Order.js';
import Payment from '../../payment/models/Payment.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import mongoose from 'mongoose';

// Dynamic import to avoid circular dependency
let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

const normalizeIdentifier = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (value._id) return normalizeIdentifier(value._id);
    if (value.restaurantId) return normalizeIdentifier(value.restaurantId);
    if (value.storeId) return normalizeIdentifier(value.storeId);
    if (value.id) return normalizeIdentifier(value.id);
  }
  return String(value).trim();
};

const buildRestaurantLookupQuery = (restaurantId) => {
  const normalized = normalizeIdentifier(restaurantId);
  if (!normalized) return null;

  const orConditions = [
    { restaurantId: normalized },
    { slug: normalized }
  ];

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    orConditions.unshift({ _id: new mongoose.Types.ObjectId(normalized) });
  }

  return { $or: orConditions };
};

/**
 * Notify restaurant about new order via Socket.IO
 * @param {Object} order - Order document
 * @param {string} restaurantId - Restaurant ID
 * @param {string} [paymentMethodOverride] - Explicit payment method ('cash' | 'razorpay') so restaurant sees correct value
 */
export async function notifyRestaurantNewOrder(order, restaurantId, paymentMethodOverride) {
  try {
    const io = await getIOInstance();

    if (!io) {
      console.warn('Socket.IO not initialized, skipping restaurant notification');
      return;
    }

    // CRITICAL: Validate restaurantId matches order's restaurantId
    const orderRestaurantId = normalizeIdentifier(order.restaurantId);
    const providedRestaurantId = normalizeIdentifier(restaurantId);
    
    if (orderRestaurantId && providedRestaurantId && orderRestaurantId !== providedRestaurantId) {
      console.error('❌ CRITICAL: RestaurantId mismatch in notification!', {
        orderRestaurantId: orderRestaurantId,
        providedRestaurantId: providedRestaurantId,
        orderId: order.orderId,
        orderRestaurantName: order.restaurantName
      });
      // Use order's restaurantId instead of provided one
      restaurantId = orderRestaurantId;
    } else if (!providedRestaurantId && orderRestaurantId) {
      restaurantId = orderRestaurantId;
    }

    // Get restaurant details
    let restaurant = null;
    const restaurantLookupQuery = buildRestaurantLookupQuery(restaurantId);
    if (restaurantLookupQuery) {
      restaurant = await Restaurant.findOne(restaurantLookupQuery).lean();
    }
    
    // Validate restaurant name matches order
    if (restaurant && order.restaurantName && restaurant.name !== order.restaurantName) {
      console.warn('⚠️ Restaurant name mismatch:', {
        orderRestaurantName: order.restaurantName,
        foundRestaurantName: restaurant.name,
        restaurantId: restaurantId
      });
      // Still proceed but log warning
    }

    // Resolve payment method: override > order.payment > Payment collection (COD fallback)
    let resolvedPaymentMethod = paymentMethodOverride ?? order.payment?.method ?? 'razorpay';
    if (resolvedPaymentMethod !== 'cash') {
      try {
        const paymentRecord = await Payment.findOne({ orderId: order._id }).select('method').lean();
        if (paymentRecord?.method === 'cash') resolvedPaymentMethod = 'cash';
      } catch (e) { /* ignore */ }
    }

    const inferredPlatform = String(
      restaurant?.platform ||
      order?.restaurantPlatform ||
      order?.platform ||
      ''
    ).toLowerCase();
    const isGroceryStore = inferredPlatform === 'mogrocery';
    const targetNamespacePath = isGroceryStore ? '/grocery-store' : '/restaurant';
    const roomPrefix = isGroceryStore ? 'grocery-store' : 'restaurant';

    // Prepare order notification data
    const orderNotification = {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: normalizeIdentifier(restaurantId),
      restaurantName: order.restaurantName,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      total: order.pricing.total,
      customerAddress: {
        label: order.address.label,
        street: order.address.street,
        city: order.address.city,
        location: order.address.location
      },
      status: order.status,
      createdAt: order.createdAt,
      estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
      note: order.note || '',
      sendCutlery: order.sendCutlery,
      paymentMethod: resolvedPaymentMethod
    };
    console.log('📢 Restaurant notification payload paymentMethod:', orderNotification.paymentMethod, { override: paymentMethodOverride, orderPaymentMethod: order.payment?.method });

    // Route notifications to the correct dashboard namespace (restaurant/store).
    const restaurantNamespace = io.of(targetNamespacePath);

    const normalizedRestaurantId = normalizeIdentifier(restaurantId);
    const roomCandidateIds = Array.from(
      new Set(
        [
          normalizedRestaurantId,
          orderRestaurantId,
          normalizeIdentifier(restaurant?._id),
          normalizeIdentifier(restaurant?.restaurantId)
        ].filter(Boolean)
      )
    );
    const roomVariations = roomCandidateIds.map((id) => `${roomPrefix}:${id}`);

    // Get all connected sockets in the restaurant room
    let socketsInRoom = [];
    let resolvedRoom = roomVariations[0] || `${roomPrefix}:${normalizedRestaurantId}`;
    for (const room of roomVariations) {
      const sockets = await restaurantNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        socketsInRoom = sockets;
        resolvedRoom = room;
        console.log(`📢 Found ${sockets.length} socket(s) in room: ${room}`);
        break;
      }
    }

    const primaryRoom = roomVariations[0] || resolvedRoom;

    console.log(`📢 CRITICAL: Attempting to notify restaurant about new order:`);
    console.log(`📢 Order ID: ${order.orderId}`);
    console.log(`📢 Order MongoDB ID: ${order._id?.toString()}`);
    console.log(`📢 Restaurant ID (normalized): ${normalizedRestaurantId}`);
    console.log(`📢 Restaurant Name: ${order.restaurantName}`);
    console.log(`📢 Restaurant ID from order: ${order.restaurantId}`);
    console.log(`📢 Room variations to try:`, roomVariations);
    console.log(`📢 Connected sockets in primary room ${primaryRoom}: ${socketsInRoom.length}`);

    // CRITICAL: Only emit to the specific restaurant room - NEVER broadcast to all restaurants
    // This ensures orders only go to the correct restaurant
    if (socketsInRoom.length > 0) {
      // Found sockets in the restaurant room - send notification only to that room
      restaurantNamespace.to(resolvedRoom).emit('new_order', orderNotification);
      restaurantNamespace.to(resolvedRoom).emit('play_notification_sound', {
        type: 'new_order',
        orderId: order.orderId,
        message: `New order received: ${order.orderId}`
      });
      console.log(`📤 Sent notification to room: ${resolvedRoom}`);
      console.log(`✅ Notified restaurant ${normalizedRestaurantId} about new order ${order.orderId} (${socketsInRoom.length} socket(s) connected)`);
    } else {
      // No sockets found in restaurant room - log error but DO NOT broadcast to all restaurants
      console.error(`❌ CRITICAL: No sockets found for ${isGroceryStore ? 'store' : 'restaurant'} ${normalizedRestaurantId} in any room!`);
      console.error(`❌ Order ${order.orderId} will NOT be delivered to ${isGroceryStore ? 'store' : 'restaurant'} ${normalizedRestaurantId}`);
      console.error(`❌ Room variations tried:`, roomVariations);
      console.error(`❌ Restaurant name: ${order.restaurantName}`);
      console.error(`❌ Restaurant ID from order: ${order.restaurantId}`);
      console.error(`❌ Normalized restaurant ID: ${normalizedRestaurantId}`);
      
      // Log all connected restaurant sockets for debugging (but don't send to them)
      const allSockets = await restaurantNamespace.fetchSockets();
      console.log(`📊 Total ${isGroceryStore ? 'grocery-store' : 'restaurant'} sockets connected: ${allSockets.length}`);
      if (allSockets.length > 0) {
        // Get room information for each socket
        const socketRooms = [];
        for (const socket of allSockets) {
          const rooms = Array.from(socket.rooms);
          socketRooms.push({
            socketId: socket.id,
            rooms: rooms.filter(r => r.startsWith(`${roomPrefix}:`))
          });
        }
        console.log(`📊 Connected ${isGroceryStore ? 'store' : 'restaurant'} sockets and their rooms:`, socketRooms);
      }
      
      // Still try to emit to room variations (in case socket connects later)
      // But DO NOT broadcast to all restaurants
      roomVariations.forEach(room => {
        restaurantNamespace.to(room).emit('new_order', orderNotification);
        restaurantNamespace.to(room).emit('play_notification_sound', {
          type: 'new_order',
          orderId: order.orderId,
          message: `New order received: ${order.orderId}`
        });
        console.log(`📤 Emitted to room ${room} (no sockets found, but room exists for future connections)`);
      });
      
      // Return error instead of success
      return {
        success: false,
        restaurantId,
        orderId: order.orderId,
        error: 'Restaurant not connected to Socket.IO',
        message: `${isGroceryStore ? 'Store' : 'Restaurant'} ${normalizedRestaurantId} (${order.restaurantName}) is not connected. Order notification not sent.`
      };
    }

    return {
      success: true,
      restaurantId,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('Error notifying restaurant:', error);
    throw error;
  }
}

/**
 * Notify restaurant about order status update
 * @param {string} orderId - Order ID
 * @param {string} status - New status
 */
export async function notifyRestaurantOrderUpdate(orderId, status) {
  try {
    const io = await getIOInstance();

    if (!io) {
      return;
    }

    const order = await Order.findById(orderId).lean();
    if (!order) {
      throw new Error('Order not found');
    }

    const restaurantLookupQuery = buildRestaurantLookupQuery(order.restaurantId);
    const restaurant = restaurantLookupQuery
      ? await Restaurant.findOne(restaurantLookupQuery).select('platform _id restaurantId').lean()
      : null;
    const isGroceryStore = String(restaurant?.platform || '').toLowerCase() === 'mogrocery';
    const targetNamespacePath = isGroceryStore ? '/grocery-store' : '/restaurant';
    const roomPrefix = isGroceryStore ? 'grocery-store' : 'restaurant';

    // Emit status updates to platform-specific namespace/room.
    const restaurantNamespace = io.of(targetNamespacePath);

    const roomIds = Array.from(
      new Set(
        [
          normalizeIdentifier(order.restaurantId),
          normalizeIdentifier(restaurant?._id),
          normalizeIdentifier(restaurant?.restaurantId)
        ].filter(Boolean)
      )
    );

    roomIds.forEach((id) => {
      restaurantNamespace.to(`${roomPrefix}:${id}`).emit('order_status_update', {
        orderId: order.orderId,
        status,
        updatedAt: new Date()
      });
    });

    console.log(`📢 Notified restaurant ${order.restaurantId} about order ${order.orderId} status: ${status}`);
  } catch (error) {
    console.error('Error notifying restaurant about order update:', error);
    throw error;
  }
}
