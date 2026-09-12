import { computeWeeklyPayouts } from '../../restaurant/utils/weeklyPayout.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

/**
 * Weekly payment report for a grocery store (requirement 2).
 *
 * The same calculation the restaurant report uses: a store's orders carry the
 * store id in the same field and are marked mogrocery, and store commission is
 * configured in the same collection. Only the platform filter differs.
 *
 * Stores sign in through their own module, so the restaurant route rejected
 * them and the store app's Weekly Payments screen could not load at all.
 *
 * GET /api/grocery/store/finance/weekly?weeks=8
 */
export const getStoreWeeklyPayments = asyncHandler(async (req, res) => {
  try {
    const store = req.store;
    const weeks = Math.max(1, Math.min(52, parseInt(req.query.weeks, 10) || 8));

    const cycles = await computeWeeklyPayouts(store, {
      weeks,
      platformQuery: { restaurantPlatform: 'mogrocery' },
    });

    const totals = cycles.reduce(
      (acc, cycle) => {
        if (cycle.status === 'Paid') acc.paid += cycle.amount;
        else if (cycle.status === 'Due') acc.due += cycle.amount;
        else acc.pending += cycle.amount;
        return acc;
      },
      { paid: 0, pending: 0, due: 0 },
    );

    const round = (value) => Math.round(value * 100) / 100;

    return successResponse(res, 200, 'Weekly payments retrieved successfully', {
      commissionConfigured: cycles[0]?.commissionConfigured ?? false,
      totals: { paid: round(totals.paid), pending: round(totals.pending), due: round(totals.due) },
      weeks: cycles,
    });
  } catch (error) {
    console.error('Error fetching store weekly payments:', error);
    return errorResponse(res, 500, 'Failed to fetch weekly payments');
  }
});
