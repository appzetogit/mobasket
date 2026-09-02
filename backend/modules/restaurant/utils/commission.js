/**
 * Commission calculation for restaurant payouts.
 *
 * Extracted from restaurantFinanceController so the finance screen and the
 * weekly payment report cannot drift apart. Behaviour is unchanged: highest
 * priority matching rule wins, then the configured default, then 10%.
 */

export const isCommissionConfigured = (restaurantCommission) =>
  Boolean(restaurantCommission?.status);

/**
 * Build a calculator bound to one restaurant's commission configuration.
 * Rules are sorted once here rather than on every order.
 */
export const createCommissionCalculator = (restaurantCommission) => {
  const configured = isCommissionConfigured(restaurantCommission);

  const sortedRules = [...(restaurantCommission?.commissionRules || [])]
    .filter((rule) => rule?.isActive)
    .sort((a, b) => {
      if ((b?.priority || 0) !== (a?.priority || 0)) {
        return (b?.priority || 0) - (a?.priority || 0);
      }
      return (a?.minOrderAmount || 0) - (b?.minOrderAmount || 0);
    });

  return (orderAmount) => {
    if (!configured) {
      return { commission: 0, type: null, value: null, configured: false };
    }

    let matchingRule = null;
    for (const rule of sortedRules) {
      if (orderAmount >= rule.minOrderAmount) {
        if (rule.maxOrderAmount === null || rule.maxOrderAmount === undefined || orderAmount <= rule.maxOrderAmount) {
          matchingRule = rule;
          break;
        }
      }
    }

    let commission = 0;
    let commissionType = 'percentage';
    let commissionValue = 10;

    if (matchingRule) {
      commissionType = matchingRule.type;
      commissionValue = matchingRule.value;
      commission = matchingRule.type === 'percentage'
        ? (orderAmount * matchingRule.value) / 100
        : matchingRule.value;
    } else if (restaurantCommission.defaultCommission) {
      commissionType = restaurantCommission.defaultCommission.type || 'percentage';
      commissionValue = restaurantCommission.defaultCommission.value || 10;
      commission = commissionType === 'percentage'
        ? (orderAmount * commissionValue) / 100
        : commissionValue;
    } else {
      commission = (orderAmount * 10) / 100;
    }

    return {
      commission: Math.round(commission * 100) / 100,
      type: commissionType,
      value: commissionValue,
      configured: true,
    };
  };
};

/**
 * Commission is charged on food price only - subtotal minus discount - never on
 * platform fee, GST or delivery fee.
 */
export const foodPriceForOrder = (order) =>
  (order?.pricing?.subtotal || 0) - (order?.pricing?.discount || 0);

/** Monday 00:00:00 of the week containing `date`. */
export const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const daysFromMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Sunday 23:59:59.999 of the week starting at `weekStart`. */
export const getWeekEnd = (weekStart) => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};
