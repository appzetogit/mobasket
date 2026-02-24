import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryProduct from '../../grocery/models/GroceryProduct.js';

const resolveRestaurantPlatform = async (restaurantId) => {
  const normalized = String(restaurantId || '').trim();
  if (!normalized) return null;

  if (mongoose.Types.ObjectId.isValid(normalized) && normalized.length === 24) {
    const byId = await Restaurant.findById(normalized).select('platform').lean();
    if (byId?.platform) return byId.platform;
  }

  const byAltId = await Restaurant.findOne({
    $or: [
      { restaurantId: normalized },
      { slug: normalized }
    ]
  }).select('platform').lean();

  return byAltId?.platform || null;
};

const aggregateOrderItems = (orderItems = []) => {
  const quantities = new Map();
  for (const item of orderItems) {
    const itemId = String(item?.itemId || '').trim();
    const quantity = Number(item?.quantity || 0);
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) continue;
    if (!mongoose.Types.ObjectId.isValid(itemId)) continue;
    quantities.set(itemId, (quantities.get(itemId) || 0) + quantity);
  }
  return quantities;
};

const ensureOrderExists = async (orderInput) => {
  if (!orderInput?._id) {
    throw new Error('Order is required for grocery stock sync');
  }

  const order = await Order.findById(orderInput._id);
  if (!order) {
    throw new Error(`Order not found for grocery stock sync: ${orderInput._id}`);
  }
  return order;
};

const createStockError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const markOrderReduced = async (orderId) =>
  Order.findOneAndUpdate(
    {
      _id: orderId,
      $or: [
        { 'stockSync.grocery.reduced': { $exists: false } },
        { 'stockSync.grocery.reduced': false }
      ]
    },
    {
      $set: {
        'stockSync.grocery.reduced': true,
        'stockSync.grocery.reducedAt': new Date(),
        'stockSync.grocery.restored': false,
        'stockSync.grocery.restoredAt': null
      }
    },
    { new: true }
  );

const markOrderReduceFailed = async (orderId) =>
  Order.findByIdAndUpdate(orderId, {
    $set: {
      'stockSync.grocery.reduced': false,
      'stockSync.grocery.reducedAt': null,
      'stockSync.grocery.restored': false,
      'stockSync.grocery.restoredAt': null
    }
  });

const markOrderRestored = async (orderId) =>
  Order.findOneAndUpdate(
    {
      _id: orderId,
      'stockSync.grocery.reduced': true,
      $or: [
        { 'stockSync.grocery.restored': { $exists: false } },
        { 'stockSync.grocery.restored': false }
      ]
    },
    {
      $set: {
        'stockSync.grocery.restored': true,
        'stockSync.grocery.restoredAt': new Date()
      }
    },
    { new: true }
  );

export const reduceGroceryStockForOrder = async (orderInput) => {
  const order = await ensureOrderExists(orderInput);
  const platform = await resolveRestaurantPlatform(order.restaurantId);
  if (platform !== 'mogrocery') {
    return { applied: false, reason: 'not_mogrocery' };
  }

  const aggregatedItems = aggregateOrderItems(order.items || []);
  const itemEntries = Array.from(aggregatedItems.entries());
  if (!itemEntries.length) {
    return { applied: false, reason: 'no_valid_items' };
  }

  const lockOrder = await markOrderReduced(order._id);
  if (!lockOrder) {
    return { applied: false, reason: 'already_reduced' };
  }

  const adjustedItems = [];
  try {
    for (const [productId, quantity] of itemEntries) {
      const updateResult = await GroceryProduct.updateOne(
        { _id: productId, stockQuantity: { $gte: quantity } },
        { $inc: { stockQuantity: -quantity } }
      );

      if (updateResult.modifiedCount !== 1) {
        const product = await GroceryProduct.findById(productId).select('name stockQuantity').lean();
        const productName = product?.name || 'Product';
        throw createStockError(
          `${productName} is out of stock. Available: ${Number(product?.stockQuantity || 0)}`
        );
      }

      adjustedItems.push([productId, quantity]);
    }

    await GroceryProduct.updateMany(
      { _id: { $in: itemEntries.map(([productId]) => productId) }, stockQuantity: { $lte: 0 } },
      { $set: { inStock: false } }
    );

    return { applied: true, reason: 'reduced' };
  } catch (error) {
    for (const [productId, quantity] of adjustedItems) {
      await GroceryProduct.updateOne(
        { _id: productId },
        { $inc: { stockQuantity: quantity } }
      );
    }
    await markOrderReduceFailed(order._id);
    throw error;
  }
};

export const restoreGroceryStockForOrder = async (orderInput) => {
  const order = await ensureOrderExists(orderInput);
  const platform = await resolveRestaurantPlatform(order.restaurantId);
  if (platform !== 'mogrocery') {
    return { applied: false, reason: 'not_mogrocery' };
  }

  const aggregatedItems = aggregateOrderItems(order.items || []);
  const itemEntries = Array.from(aggregatedItems.entries());
  if (!itemEntries.length) {
    return { applied: false, reason: 'no_valid_items' };
  }

  const lockOrder = await markOrderRestored(order._id);
  if (!lockOrder) {
    return { applied: false, reason: 'already_restored_or_not_reduced' };
  }

  for (const [productId, quantity] of itemEntries) {
    await GroceryProduct.updateOne(
      { _id: productId },
      { $inc: { stockQuantity: quantity } }
    );
  }

  await GroceryProduct.updateMany(
    { _id: { $in: itemEntries.map(([productId]) => productId) }, stockQuantity: { $gt: 0 } },
    { $set: { inStock: true } }
  );

  return { applied: true, reason: 'restored' };
};
