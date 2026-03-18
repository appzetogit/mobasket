import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const CACHE_DIR = path.join(__dirname, '../cache');

const formatOrders = async (db, collectionName) => {
  const ordersCollection = db.collection(collectionName);
  const usersCollection = db.collection('users');
  const deliveriesCollection = db.collection('deliveries');

  const rawOrders = await ordersCollection.find(
    {},
    {
      projection: {
        orderId: 1,
        createdAt: 1,
        userId: 1,
        restaurantId: 1,
        restaurantName: 1,
        restaurantPlatform: 1,
        platform: 1,
        status: 1,
        'payment.method': 1,
        'payment.status': 1,
        'pricing.subtotal': 1,
        'pricing.deliveryFee': 1,
        'pricing.platformFee': 1,
        'pricing.tax': 1,
        'pricing.discount': 1,
        'pricing.total': 1,
        'pricing.couponCode': 1,
        deliveryFleet: 1,
        'items.itemId': 1,
        'items.name': 1,
        'items.quantity': 1,
        deliveryPartnerId: 1,
        estimatedDeliveryTime: 1,
        deliveredAt: 1,
        cancellationReason: 1,
        cancelledAt: 1,
        cancelledBy: 1,
        scheduledDelivery: 1,
        adminApproval: 1
      }
    }
  ).sort({ _id: -1 }).toArray();

  const userIds = Array.from(new Set(
    rawOrders
      .map((order) => String(order?.userId || '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  )).map((id) => new mongoose.Types.ObjectId(id));

  const deliveryIds = Array.from(new Set(
    rawOrders
      .map((order) => String(order?.deliveryPartnerId || '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  )).map((id) => new mongoose.Types.ObjectId(id));

  const [users, deliveries] = await Promise.all([
    userIds.length > 0
      ? usersCollection.find({ _id: { $in: userIds } }, { projection: { _id: 1, name: 1, email: 1, phone: 1 } }).toArray()
      : [],
    deliveryIds.length > 0
      ? deliveriesCollection.find({ _id: { $in: deliveryIds } }, { projection: { _id: 1, name: 1, phone: 1 } }).toArray()
      : []
  ]);

  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const deliveryMap = new Map(deliveries.map((delivery) => [String(delivery._id), delivery]));

  return rawOrders.map((order, index) => {
    const orderDate = new Date(order.createdAt);
    const user = userMap.get(String(order.userId || '')) || null;
    const delivery = deliveryMap.get(String(order.deliveryPartnerId || '')) || null;
    const paymentMethod = String(order.payment?.method || '').toLowerCase();
    const isCodPayment = paymentMethod === 'cash' || paymentMethod === 'cod';
    const paymentStatusMap = {
      completed: 'Paid',
      pending: 'Pending',
      failed: 'Failed',
      refunded: 'Refunded',
      processing: 'Processing'
    };
    const paymentStatusDisplay = isCodPayment
      ? (order.status === 'delivered' ? 'Paid' : 'Pending')
      : (paymentStatusMap[order.payment?.status] || 'Pending');
    const statusMap = {
      pending: 'Pending',
      confirmed: 'Accepted',
      preparing: 'Processing',
      ready: 'Ready',
      out_for_delivery: 'Food On The Way',
      delivered: 'Delivered',
      scheduled: 'Scheduled',
      dine_in: 'Dine In'
    };

    let orderStatusDisplay = statusMap[order.status] || order.status;
    if (order.status === 'cancelled') {
      if (order.cancelledBy === 'restaurant') orderStatusDisplay = 'Cancelled by Restaurant';
      else if (order.cancelledBy === 'user') orderStatusDisplay = 'Cancelled by User';
      else orderStatusDisplay = 'Canceled';
    }

    return {
      sl: index + 1,
      orderId: order.orderId,
      id: String(order._id),
      date: orderDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).toUpperCase(),
      time: orderDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).toUpperCase(),
      createdAt: order.createdAt,
      customerName: user?.name || 'Unknown',
      customerPhone: user?.phone || '',
      customerEmail: user?.email || '',
      restaurant: order.restaurantName || 'Unknown Restaurant',
      restaurantId: String(order.restaurantId || ''),
      restaurantPlatform: String(order.restaurantPlatform || order.platform || 'mofood').toLowerCase(),
      totalItemAmount: order.pricing?.subtotal || 0,
      itemDiscount: order.pricing?.discount || 0,
      discountedAmount: Math.max(0, (order.pricing?.subtotal || 0) - (order.pricing?.discount || 0)),
      couponDiscount: order.pricing?.couponCode ? (order.pricing?.discount || 0) : 0,
      referralDiscount: 0,
      vatTax: order.pricing?.tax || 0,
      deliveryCharge: order.pricing?.deliveryFee || 0,
      platformFee: order.pricing?.platformFee || 0,
      totalAmount: order.pricing?.total || 0,
      paymentStatus: paymentStatusDisplay,
      paymentType: isCodPayment ? 'Cash on Delivery' : (paymentMethod === 'wallet' ? 'Wallet' : 'Online'),
      paymentCollectionStatus: isCodPayment
        ? (order.status === 'delivered' ? 'Collected' : 'Not Collected')
        : 'Collected',
      orderStatus: orderStatusDisplay,
      status: order.status,
      adminApprovalStatus: order.adminApproval?.status || null,
      canAdminApprove: false,
      adminApprovalReason: order.adminApproval?.reason || null,
      adminReviewedAt: order.adminApproval?.reviewedAt || null,
      deliveryType: order.deliveryFleet === 'fast' ? 'Fast Delivery' : 'Home Delivery',
      items: Array.isArray(order.items) ? order.items : [],
      deliveryPartnerId: delivery?._id ? String(delivery._id) : (order.deliveryPartnerId ? String(order.deliveryPartnerId) : null),
      deliveryPartnerName: delivery?.name || null,
      deliveryPartnerPhone: delivery?.phone || null,
      estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
      deliveredAt: order.deliveredAt || null,
      cancellationReason: order.cancellationReason || null,
      cancelledAt: order.cancelledAt || null,
      cancelledBy: order.cancelledBy || null,
      scheduledDelivery: order.scheduledDelivery || null,
      isScheduled: Boolean(order?.scheduledDelivery?.isScheduled && order?.scheduledDelivery?.scheduledFor),
      scheduledFor: order?.scheduledDelivery?.scheduledFor || null,
      scheduledDate: order?.scheduledDelivery?.scheduledFor
        ? new Date(order.scheduledDelivery.scheduledFor).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }).toUpperCase()
        : '',
      scheduledTime: order?.scheduledDelivery?.scheduledFor
        ? new Date(order.scheduledDelivery.scheduledFor).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }).toUpperCase()
        : '',
      scheduledTimeSlot: order?.scheduledDelivery?.timeSlot || ''
    };
  });
};

const writeSnapshot = async (platform, orders) => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const filePath = path.join(CACHE_DIR, `admin-orders-${platform}.json`);
  await fs.writeFile(filePath, JSON.stringify(orders, null, 2), 'utf8');
  return filePath;
};

const run = async () => {
  if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI or MONGO_URI');
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const [mofoodOrders, mogroceryOrders] = await Promise.all([
    formatOrders(db, 'mofoodsorder'),
    formatOrders(db, 'mogroceryorder')
  ]);

  const [mofoodPath, mogroceryPath] = await Promise.all([
    writeSnapshot('mofood', mofoodOrders),
    writeSnapshot('mogrocery', mogroceryOrders)
  ]);

  console.log(JSON.stringify({
    mofoodPath,
    mofoodCount: mofoodOrders.length,
    mogroceryPath,
    mogroceryCount: mogroceryOrders.length
  }, null, 2));

  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
