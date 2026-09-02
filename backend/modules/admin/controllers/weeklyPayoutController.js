import mongoose from 'mongoose';
import Restaurant from '../../restaurant/models/Restaurant.js';
import RestaurantWeeklyPayout from '../../restaurant/models/RestaurantWeeklyPayout.js';
import { computeWeeklyPayouts } from '../../restaurant/utils/weeklyPayout.js';
import { getWeekEnd, getWeekStart } from '../../restaurant/utils/commission.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

const platformQueryFor = (restaurant) =>
  restaurant?.platform === 'mogrocery'
    ? { restaurantPlatform: 'mogrocery' }
    : {
        $or: [
          { restaurantPlatform: 'mofood' },
          { restaurantPlatform: { $exists: false } },
          { restaurantPlatform: null },
        ],
      };

/**
 * Weekly payouts for one restaurant (admin view)
 * GET /api/admin/restaurants/:restaurantId/weekly-payouts?weeks=8
 */
export const getRestaurantWeeklyPayouts = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return errorResponse(res, 400, 'Invalid restaurant id');
    }

    const restaurant = await Restaurant.findById(restaurantId)
      .select('_id restaurantId name platform')
      .lean();
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    const weeks = Math.max(1, Math.min(52, parseInt(req.query.weeks, 10) || 8));
    const cycles = await computeWeeklyPayouts(restaurant, {
      weeks,
      platformQuery: platformQueryFor(restaurant),
    });

    return successResponse(res, 200, 'Weekly payouts retrieved successfully', {
      restaurant: {
        id: restaurant._id,
        name: restaurant.name,
        restaurantId: restaurant.restaurantId,
      },
      weeks: cycles,
    });
  } catch (error) {
    console.error('Error fetching weekly payouts:', error);
    return errorResponse(res, 500, 'Failed to fetch weekly payouts');
  }
});

/**
 * Mark a week Paid, Pending or Due
 * PATCH /api/admin/restaurants/:restaurantId/weekly-payouts
 * Body: { weekStart, status, note? }
 */
export const setWeeklyPayoutStatus = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { weekStart, status, note } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return errorResponse(res, 400, 'Invalid restaurant id');
    }
    if (!['Paid', 'Pending', 'Due'].includes(status)) {
      return errorResponse(res, 400, 'Status must be Paid, Pending or Due');
    }

    const parsedWeek = new Date(weekStart);
    if (Number.isNaN(parsedWeek.getTime())) {
      return errorResponse(res, 400, 'A valid weekStart date is required');
    }

    const restaurant = await Restaurant.findById(restaurantId)
      .select('_id restaurantId name platform')
      .lean();
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Normalise to the Monday of that week so the same period cannot be stored
    // under several keys.
    const normalizedStart = getWeekStart(parsedWeek);
    const normalizedEnd = getWeekEnd(normalizedStart);

    // Record the amount as it stood when the status was set, for audit.
    const cycles = await computeWeeklyPayouts(restaurant, {
      weeks: 52,
      platformQuery: platformQueryFor(restaurant),
    });
    const match = cycles.find(
      (cycle) => cycle.weekStart.getTime() === normalizedStart.getTime(),
    );

    const updated = await RestaurantWeeklyPayout.findOneAndUpdate(
      { restaurantId: restaurant._id, weekStart: normalizedStart },
      {
        $set: {
          weekEnd: normalizedEnd,
          status,
          note: typeof note === 'string' ? note.trim() : '',
          amountAtMarking: match?.amount || 0,
          markedBy: req.admin?._id || null,
          markedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return successResponse(res, 200, 'Weekly payout status updated', {
      weekStart: updated.weekStart,
      weekEnd: updated.weekEnd,
      status: updated.status,
      note: updated.note,
      amountAtMarking: updated.amountAtMarking,
      markedAt: updated.markedAt,
    });
  } catch (error) {
    console.error('Error updating weekly payout status:', error);
    return errorResponse(res, 500, 'Failed to update weekly payout status');
  }
});
