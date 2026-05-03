import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../../auth/models/User.js';
import { sendOrderPushNotification } from '../../../shared/services/orderPushNotificationService.js';

// Dynamic import to avoid circular dependency.
let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

const normalizeIdentifier = (value, visited = new WeakSet()) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);

  if (value instanceof mongoose.Types.ObjectId || value?._bsontype === 'ObjectId') {
    return String(value).trim();
  }

  if (typeof value === 'object') {
    if (visited.has(value)) return '';
    visited.add(value);

    const nestedCandidates = [value._id, value.userId, value.id];
    for (const candidate of nestedCandidates) {
      if (candidate && candidate !== value) {
        const normalizedCandidate = normalizeIdentifier(candidate, visited);
        if (normalizedCandidate) return normalizedCandidate;
      }
    }
  }

  return String(value).trim();
};

const toPrettyStatus = (status) =>
  String(status || 'updated')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const buildStatusCopy = (status, orderNumber) => {
  const prettyStatus = toPrettyStatus(status);

  switch (String(status || '').toLowerCase()) {
    case 'delivered':
      return {
        title: 'Order delivered',
        body: `${orderNumber} has been delivered successfully.`,
      };
    case 'out_for_delivery':
      return {
        title: 'Order on the way',
        body: `${orderNumber} is out for delivery.`,
      };
    case 'ready':
      return {
        title: 'Order ready',
        body: `${orderNumber} is ready for pickup by the delivery partner.`,
      };
    default:
      return {
        title: 'Order status updated',
        body: `${orderNumber} is now ${prettyStatus}.`,
      };
  }
};

export async function notifyUserOrderUpdate(orderId, status) {
  try {
    const order = await Order.findById(orderId)
      .select('_id orderId userId status')
      .lean();

    if (!order) {
      throw new Error('Order not found');
    }

    const normalizedUserId = normalizeIdentifier(order.userId);
    if (!normalizedUserId) {
      console.warn(`User notification skipped for order ${order.orderId}: missing userId`);
      return {
        success: false,
        reason: 'missing_user_id',
      };
    }

    const user = await User.findById(normalizedUserId)
      .select('_id fcmTokenWeb fcmTokenMobile pushTokens preferences')
      .lean();

    if (!user) {
      console.warn(`User notification skipped for order ${order.orderId}: user not found`);
      return {
        success: false,
        reason: 'user_not_found',
      };
    }

    if (user?.preferences?.notifications?.orders === false) {
      return {
        success: true,
        skipped: true,
        reason: 'user_notifications_disabled',
      };
    }

    const resolvedStatus = String(status || order.status || 'updated').trim() || 'updated';
    const copy = buildStatusCopy(resolvedStatus, order.orderId);

    const pushResult = await sendOrderPushNotification({
      recipients: [user],
      title: copy.title,
      body: copy.body,
      link: '/orders',
      tag: `user_order_${resolvedStatus}_${order.orderId}`,
      cleanupModels: [User],
      source: 'user_order_status_update',
      sendTo: 'user',
      data: {
        notificationType: 'order_status_update',
        orderId: String(order.orderId || ''),
        orderMongoId: String(order._id || ''),
        status: resolvedStatus,
        targetPath: '/orders',
      },
    });

    const io = await getIOInstance();
    if (io) {
      const payload = {
        orderId: order.orderId,
        orderMongoId: String(order._id || ''),
        status: resolvedStatus,
        title: copy.title,
        message: copy.body,
        updatedAt: new Date(),
      };

      const orderRoomAliases = Array.from(
        new Set(
          [order.orderId, order._id?.toString?.(), order._id]
            .filter(Boolean)
            .map((value) => String(value))
        )
      );

      orderRoomAliases.forEach((alias) => {
        io.to(`order:${alias}`).emit('order_status_update', payload);
      });

      io.to(`user:${normalizedUserId}`).emit('order_status_update', payload);
    }

    return {
      success: true,
      orderId: order.orderId,
      userId: normalizedUserId,
      push: pushResult,
    };
  } catch (error) {
    console.error('Error notifying user about order update:', error);
    throw error;
  }
}
