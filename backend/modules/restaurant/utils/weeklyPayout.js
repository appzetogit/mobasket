import mongoose from 'mongoose';
import Order from '../../order/models/Order.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import RestaurantWeeklyPayout from '../models/RestaurantWeeklyPayout.js';
import {
  createCommissionCalculator,
  foodPriceForOrder,
  getWeekEnd,
  getWeekStart,
  isCommissionConfigured,
} from './commission.js';

/**
 * Restaurant ids are stored inconsistently across collections - sometimes the
 * ObjectId, sometimes the human readable restaurantId - so orders are matched
 * against every known form.
 */
const buildRestaurantIdVariations = (restaurant) => {
  const variations = new Set();
  for (const value of [restaurant?._id, restaurant?.id, restaurant?.restaurantId]) {
    const normalized = String(value || '').trim();
    if (normalized) variations.add(normalized);
  }
  for (const value of [...variations]) {
    if (mongoose.Types.ObjectId.isValid(value)) {
      variations.add(new mongoose.Types.ObjectId(value).toString());
    }
  }
  return [...variations];
};

const loadCommission = async (idVariations) => {
  const objectIds = idVariations
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));

  try {
    return await RestaurantCommission.findOne({
      status: true,
      $or: [
        ...(objectIds.length > 0 ? [{ restaurant: { $in: objectIds } }] : []),
        { restaurantId: { $in: idVariations } },
      ],
    }).lean();
  } catch {
    return null;
  }
};

/**
 * Weekly payables for one restaurant, newest week first.
 *
 * Amounts come from delivered orders rather than OrderSettlement: settlements
 * exist for only a fraction of delivered orders, so using them would understate
 * what a vendor is owed.
 *
 * Withdrawals are deliberately not subtracted here. The finance screen nets them
 * off a single running balance; doing the same per week would deduct the same
 * withdrawal from every week. Payment state per week is the status field.
 */
export const computeWeeklyPayouts = async (restaurant, { weeks = 8, platformQuery = {} } = {}) => {
  const idVariations = buildRestaurantIdVariations(restaurant);
  const restaurantCommission = await loadCommission(idVariations);
  const configured = isCommissionConfigured(restaurantCommission);
  const calculateCommission = createCommissionCalculator(restaurantCommission);

  const currentWeekStart = getWeekStart(new Date());
  const rangeStart = new Date(currentWeekStart);
  rangeStart.setDate(rangeStart.getDate() - 7 * (weeks - 1));
  const rangeEnd = getWeekEnd(currentWeekStart);

  // platformQuery itself uses $or for mofood, so both conditions go under $and.
  // Spreading them into one object would let the second $or silently replace
  // the first and drop the platform filter.
  const orders = await Order.find({
    restaurantId: { $in: idVariations },
    status: 'delivered',
    $and: [
      ...(Object.keys(platformQuery).length > 0 ? [platformQuery] : []),
      {
        $or: [
          { deliveredAt: { $gte: rangeStart, $lte: rangeEnd } },
          { 'tracking.delivered.timestamp': { $gte: rangeStart, $lte: rangeEnd } },
        ],
      },
    ],
  })
    .select('pricing deliveredAt tracking.delivered.timestamp')
    .lean();

  // Seed every week in range so quiet weeks still appear with a zero amount.
  const buckets = new Map();
  for (let i = 0; i < weeks; i += 1) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - 7 * i);
    buckets.set(start.getTime(), {
      weekStart: start,
      weekEnd: getWeekEnd(start),
      orderCount: 0,
      grossFoodPrice: 0,
      commission: 0,
    });
  }

  for (const order of orders) {
    const deliveredAt = order.deliveredAt || order.tracking?.delivered?.timestamp;
    if (!deliveredAt) continue;

    const bucket = buckets.get(getWeekStart(deliveredAt).getTime());
    if (!bucket) continue;

    const foodPrice = foodPriceForOrder(order);
    bucket.orderCount += 1;
    bucket.grossFoodPrice += foodPrice;
    bucket.commission += calculateCommission(foodPrice).commission;
  }

  const statusRows = await RestaurantWeeklyPayout.find({
    restaurantId: restaurant._id,
    weekStart: { $gte: rangeStart },
  }).lean();
  const statusByWeek = new Map(statusRows.map((row) => [getWeekStart(row.weekStart).getTime(), row]));

  return [...buckets.values()]
    .sort((a, b) => b.weekStart - a.weekStart)
    .map((bucket) => {
      const stored = statusByWeek.get(bucket.weekStart.getTime());
      const round = (value) => Math.round(value * 100) / 100;
      return {
        weekStart: bucket.weekStart,
        weekEnd: bucket.weekEnd,
        orderCount: bucket.orderCount,
        grossFoodPrice: round(bucket.grossFoodPrice),
        commission: round(bucket.commission),
        // What the vendor receives for the week.
        amount: configured ? Math.max(0, round(bucket.grossFoodPrice - bucket.commission)) : 0,
        status: stored?.status || 'Pending',
        note: stored?.note || '',
        markedAt: stored?.markedAt || null,
        commissionConfigured: configured,
      };
    });
};

export { buildRestaurantIdVariations };
