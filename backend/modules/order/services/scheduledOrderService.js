import Order from '../models/Order.js';
import { notifyRestaurantNewOrder } from './restaurantNotificationService.js';
import { sanitizePostOrderActions } from '../utils/postOrderActionsSanitizer.js';

const ORDER_MODIFICATION_WINDOW_MS = 2 * 60 * 1000;

/**
 * Promote due scheduled orders to active order flow.
 * Runs from cron every minute.
 */
export async function processScheduledOrders() {
  try {
    const now = new Date();

    const dueOrders = await Order.find({
      status: 'scheduled',
      'scheduledDelivery.isScheduled': true,
      'scheduledDelivery.scheduledFor': { $lte: now }
    }).lean();

    if (dueOrders.length === 0) {
      return { processed: 0, skipped: 0, message: 'No scheduled orders due' };
    }

    let processedCount = 0;
    let skippedCount = 0;

    for (const dueOrder of dueOrders) {
      try {
        const currentOrder = await Order.findById(dueOrder._id);
        if (!currentOrder || currentOrder.status !== 'scheduled') {
          continue;
        }

        const paymentMethod = currentOrder.payment?.method;
        const paymentStatus = currentOrder.payment?.status;
        const requiresCompletedPayment = paymentMethod === 'razorpay';
        if (requiresCompletedPayment && paymentStatus !== 'completed') {
          skippedCount += 1;
          continue;
        }

        const windowStartAt = new Date();
        const windowExpiresAt = new Date(windowStartAt.getTime() + ORDER_MODIFICATION_WINDOW_MS);

        currentOrder.status = 'confirmed';
        // Avoid reassigning the full tracking object because legacy docs may carry
        // undefined nested tracking fields (preparing/ready/outForDelivery/delivered),
        // which causes Mongoose cast errors when saving.
        currentOrder.set('tracking.confirmed', {
          status: true,
          timestamp: windowStartAt
        });
        currentOrder.postOrderActions = sanitizePostOrderActions({
          ...(currentOrder.postOrderActions || {}),
          modificationWindowStartAt: windowStartAt,
          modificationWindowExpiresAt: windowExpiresAt
        });

        await currentOrder.save();

        try {
          const restaurantId = currentOrder.restaurantId?.toString() || currentOrder.restaurantId;
          await notifyRestaurantNewOrder(currentOrder, restaurantId, paymentMethod || 'scheduled');
        } catch (notificationError) {
          console.error(`❌ Failed to notify restaurant for scheduled order ${currentOrder.orderId}:`, notificationError);
        }

        processedCount += 1;
      } catch (orderError) {
        skippedCount += 1;
        console.error(`❌ Failed to process scheduled order ${dueOrder.orderId}:`, orderError);
      }
    }

    return {
      processed: processedCount,
      skipped: skippedCount,
      message: `Activated ${processedCount} scheduled order(s), skipped ${skippedCount}`
    };
  } catch (error) {
    console.error('❌ Error processing scheduled orders:', error);
    return { processed: 0, skipped: 0, message: `Error: ${error.message}` };
  }
}
