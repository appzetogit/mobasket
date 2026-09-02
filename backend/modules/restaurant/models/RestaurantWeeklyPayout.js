import mongoose from 'mongoose';

/**
 * Admin-controlled payment status for one restaurant's weekly payout.
 *
 * Only the status lives here. The amount is recomputed from delivered orders on
 * read, so a rule or order correction is reflected instead of being frozen into
 * a stale snapshot. A week with no row has not been actioned yet and reads as
 * Pending.
 */
const restaurantWeeklyPayoutSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    // Monday 00:00 of the week, used as the stable key for a payout period.
    weekStart: {
      type: Date,
      required: true,
    },
    weekEnd: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['Paid', 'Pending', 'Due'],
      default: 'Pending',
      index: true,
    },
    // Amount at the moment the status was last set, kept for audit only.
    amountAtMarking: {
      type: Number,
      default: 0,
      min: 0,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    markedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// One status row per restaurant per week.
restaurantWeeklyPayoutSchema.index({ restaurantId: 1, weekStart: 1 }, { unique: true });

export default mongoose.model('RestaurantWeeklyPayout', restaurantWeeklyPayoutSchema);
