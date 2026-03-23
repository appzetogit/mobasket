import Admin from '../models/Admin.js';
import Order from '../../order/models/Order.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import OutletTimings from '../../restaurant/models/OutletTimings.js';
import Offer from '../../restaurant/models/Offer.js';
import AdminCommission from '../models/AdminCommission.js';
import OrderSettlement from '../../order/models/OrderSettlement.js';
import AdminWallet from '../models/AdminWallet.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import winston from 'winston';
import mongoose from 'mongoose';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { initializeCloudinary } from '../../../config/cloudinary.js';
import { DEFAULT_IMAGE_FALLBACK_40 } from '../../../shared/utils/imageFallback.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const normalizeCityValue = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const buildCityRegex = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
};

const getRestaurantLocationSnapshot = (restaurant = {}) => {
  const liveLocation =
    restaurant?.location && typeof restaurant.location === 'object'
      ? restaurant.location
      : {};
  const onboardingLocation =
    restaurant?.onboarding?.step1?.location &&
    typeof restaurant.onboarding.step1.location === 'object'
      ? restaurant.onboarding.step1.location
      : {};

  const mergedLocation = {
    ...onboardingLocation,
    ...liveLocation,
  };

  const hasMeaningfulLocation = [
    mergedLocation.formattedAddress,
    mergedLocation.address,
    mergedLocation.addressLine1,
    mergedLocation.addressLine2,
    mergedLocation.area,
    mergedLocation.city,
    mergedLocation.state,
    mergedLocation.pincode,
    mergedLocation.zipCode,
    mergedLocation.postalCode,
    mergedLocation.landmark,
    mergedLocation.street,
  ].some((value) => String(value || '').trim());

  return hasMeaningfulLocation ? mergedLocation : {};
};

const normalizeRestaurantAddressRecord = (restaurant = {}) => ({
  ...restaurant,
  location: getRestaurantLocationSnapshot(restaurant),
});

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const parseTimeToMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== 'string') return null;
  const normalized = timeValue.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] || null;

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

const minutesToTime24 = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes)) return null;
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const time24ToSlot = (time24) => {
  const minutes = parseTimeToMinutes(time24);
  if (!Number.isFinite(minutes)) return null;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 || 12;
  return {
    time: `${hour12}:${String(minute).padStart(2, '0')}`,
    period,
  };
};

const parseSlotTimeToMinutes = (timeValue, periodValue) => {
  if (!timeValue || typeof timeValue !== 'string') return null;
  const normalizedPeriod = String(periodValue || '').trim().toUpperCase();
  if (!normalizedPeriod || (normalizedPeriod !== 'AM' && normalizedPeriod !== 'PM')) return null;
  return parseTimeToMinutes(`${timeValue.trim()} ${normalizedPeriod}`);
};

const normalizeSlots = (slots = []) => {
  if (!Array.isArray(slots)) return [];
  return slots
    .map((slot) => {
      const startMinutes = parseSlotTimeToMinutes(slot?.start, slot?.startPeriod);
      const endMinutes = parseSlotTimeToMinutes(slot?.end, slot?.endPeriod);
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;
      return {
        start: `${Math.floor(startMinutes / 60) % 12 || 12}:${String(startMinutes % 60).padStart(2, '0')}`,
        end: `${Math.floor(endMinutes / 60) % 12 || 12}:${String(endMinutes % 60).padStart(2, '0')}`,
        startPeriod: startMinutes >= 12 * 60 ? 'pm' : 'am',
        endPeriod: endMinutes >= 12 * 60 ? 'pm' : 'am',
      };
    })
    .filter(Boolean)
    .slice(0, 3);
};

const normalizeOutletTimingsPayload = (inputTimings = [], fallback = {}) => {
  const mapByDay = new Map();
  if (Array.isArray(inputTimings)) {
    inputTimings.forEach((entry) => {
      const day = String(entry?.day || '').trim();
      if (!DAY_ORDER.includes(day)) return;
      mapByDay.set(day, entry || {});
    });
  }

  return DAY_ORDER.map((day) => {
    const entry = mapByDay.get(day) || {};
    const fallbackIsOpen = Array.isArray(fallback?.openDays)
      ? fallback.openDays.some(
          (d) => String(d || '').slice(0, 3).toLowerCase() === day.slice(0, 3).toLowerCase()
        )
      : true;
    const isOpen = entry?.isOpen !== undefined ? Boolean(entry.isOpen) : fallbackIsOpen;

    const slots = normalizeSlots(entry?.slots || []);
    const openingTime =
      String(entry?.openingTime || '').trim() ||
      (slots[0]
        ? minutesToTime24(parseSlotTimeToMinutes(slots[0].start, slots[0].startPeriod))
        : String(fallback?.openingTime || '09:00'));
    const closingTime =
      String(entry?.closingTime || '').trim() ||
      (slots[slots.length - 1]
        ? minutesToTime24(
            parseSlotTimeToMinutes(
              slots[slots.length - 1].end,
              slots[slots.length - 1].endPeriod
            )
          )
        : String(fallback?.closingTime || '22:00'));

    const slotList = slots.length > 0 ? slots : (() => {
      const openSlot = time24ToSlot(openingTime);
      const closeSlot = time24ToSlot(closingTime);
      if (!openSlot || !closeSlot) return [];
      return [{
        start: openSlot.time,
        end: closeSlot.time,
        startPeriod: openSlot.period,
        endPeriod: closeSlot.period,
      }];
    })();

    return {
      day,
      isOpen,
      openingTime: openingTime || '09:00',
      closingTime: closingTime || '22:00',
      slots: slotList,
    };
  });
};

const deriveRestaurantTimingFieldsFromOutletTimings = (timings = []) => {
  const openEntries = (Array.isArray(timings) ? timings : []).filter((entry) => entry?.isOpen !== false);
  const openDays = openEntries.map((entry) => entry?.day).filter((day) => DAY_ORDER.includes(day));
  const openingMinutes = [];
  const closingMinutes = [];

  openEntries.forEach((entry) => {
    const slots = Array.isArray(entry?.slots) ? entry.slots : [];
    if (slots.length > 0) {
      slots.forEach((slot) => {
        const startMinutes = parseSlotTimeToMinutes(slot?.start, slot?.startPeriod);
        const endMinutes = parseSlotTimeToMinutes(slot?.end, slot?.endPeriod);
        if (Number.isFinite(startMinutes)) openingMinutes.push(startMinutes);
        if (Number.isFinite(endMinutes)) closingMinutes.push(endMinutes);
      });
      return;
    }

    const openMin = parseTimeToMinutes(entry?.openingTime);
    const closeMin = parseTimeToMinutes(entry?.closingTime);
    if (Number.isFinite(openMin)) openingMinutes.push(openMin);
    if (Number.isFinite(closeMin)) closingMinutes.push(closeMin);
  });

  return {
    openDays,
    deliveryTimings:
      openingMinutes.length > 0 && closingMinutes.length > 0
        ? {
            openingTime: minutesToTime24(Math.min(...openingMinutes)) || '09:00',
            closingTime: minutesToTime24(Math.max(...closingMinutes)) || '22:00',
          }
        : {
            openingTime: '09:00',
            closingTime: '22:00',
          },
  };
};

const normalizeSidebarAccess = (sidebarAccess) => {
  if (!Array.isArray(sidebarAccess)) return [];
  return Array.from(
    new Set(
      sidebarAccess
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.startsWith('/admin'))
    )
  );
};

const resolveDuplicateAdminField = (error) => {
  const fieldFromPattern = error?.keyPattern ? Object.keys(error.keyPattern)[0] : null;
  if (fieldFromPattern) return fieldFromPattern;

  const fieldFromValue = error?.keyValue ? Object.keys(error.keyValue)[0] : null;
  if (fieldFromValue) return fieldFromValue;

  const rawMessage = String(error?.message || "");
  const fieldFromDupKey = rawMessage.match(/dup key:\s*\{\s*([^:}\s]+)\s*:/i)?.[1];
  if (fieldFromDupKey) return fieldFromDupKey;

  const indexName = rawMessage.match(/index:\s*([^\s]+)\s*dup key/i)?.[1] || "";
  if (indexName.includes("email")) return "email";
  if (indexName.includes("phone")) return "phone";
  return "email";
};

const resolveDuplicateAdminValue = (error, field) => {
  if (error?.keyValue && field && Object.prototype.hasOwnProperty.call(error.keyValue, field)) {
    return error.keyValue[field];
  }

  const rawMessage = String(error?.message || "");
  const valueFromDupKey = rawMessage.match(/dup key:\s*\{\s*[^:}\s]+\s*:\s*("?[^"}]*"?|null)\s*\}/i)?.[1];
  if (!valueFromDupKey) return null;
  return valueFromDupKey.replace(/^"|"$/g, "");
};


/**
 * Get Admin Dashboard Statistics
 * GET /api/admin/dashboard/stats
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const requestedPlatform = req.query?.platform === 'mogrocery' ? 'mogrocery' : 'mofood';
    const requestedCity = String(req.query?.city || req.query?.zone || '').trim();
    const cityRegex = buildCityRegex(requestedCity);
    const restaurantPlatformQuery = { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthlyWindowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    let scopedRestaurants = [];
    if (requestedPlatform === 'mogrocery') {
      scopedRestaurants = await GroceryStore.find(
        cityRegex ? { 'location.city': cityRegex } : {}
      ).select('_id').lean();
    } else {
      scopedRestaurants = await Restaurant.find({
        ...restaurantPlatformQuery,
        ...(cityRegex ? { 'location.city': cityRegex } : {})
      }).select('_id').lean();
    }

    const scopedRestaurantObjectIds = scopedRestaurants.map((restaurant) => restaurant._id);
    const scopedRestaurantStringIds = scopedRestaurantObjectIds.map((id) => String(id));

    const scopedOrderMatch = cityRegex
      ? { restaurantId: { $in: scopedRestaurantStringIds } }
      : requestedPlatform === 'mogrocery'
        ? { restaurantPlatform: 'mogrocery' }
        : {
            $or: [
              { restaurantPlatform: 'mofood' },
              { restaurantPlatform: { $exists: false } }
            ]
          };
    const scopedSettlementMatch = { restaurantId: { $in: scopedRestaurantObjectIds } };

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthSeries = [];
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      monthSeries.push({
        key: `${year}-${month}`,
        year,
        month,
        label: monthNames[date.getMonth()],
      });
    }

    const User = (await import('../../auth/models/User.js')).default;
    const pendingRestaurantRequestsQuery = {
      isActive: false,
      $and: [
        {
          $or: [
            { 'onboarding.completedSteps': 4 },
            {
              $and: [
                { 'name': { $exists: true, $ne: null, $ne: '' } },
                { 'cuisines': { $exists: true, $ne: null, $not: { $size: 0 } } },
                { 'openDays': { $exists: true, $ne: null, $not: { $size: 0 } } },
                { 'estimatedDeliveryTime': { $exists: true, $ne: null, $ne: '' } },
                { 'featuredDish': { $exists: true, $ne: null, $ne: '' } }
              ]
            }
          ]
        },
        {
          $or: [
            { 'rejectionReason': { $exists: false } },
            { 'rejectionReason': null }
          ]
        }
      ]
    };
    const [
      revenueStats,
      orderStats,
      totalOrders,
      recentOrders,
      distinctScopedCustomers,
      monthlyOrdersAgg,
      settlementTotalsAgg,
      settlementLast30DaysAgg,
      monthlySettlementAgg,
      activeRestaurants,
      pendingRestaurantRequests,
      recentRestaurants,
      deliveryPartnerAgg,
      menuTotalsAgg,
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            ...scopedOrderMatch,
            status: 'delivered',
            'pricing.total': { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.total' },
            last30DaysRevenue: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', last30Days] }, '$pricing.total', 0]
              }
            }
          }
        }
      ]),
      Order.aggregate([
        { $match: scopedOrderMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Order.countDocuments({ ...scopedOrderMatch, status: 'delivered' }),
      Order.countDocuments({ ...scopedOrderMatch, createdAt: { $gte: last24Hours } }),
      Order.distinct('userId', scopedOrderMatch),
      Order.aggregate([
        {
          $match: {
            ...scopedOrderMatch,
            status: 'delivered',
            deliveredAt: { $gte: monthlyWindowStart, $lte: now }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$deliveredAt' },
              month: { $month: '$deliveredAt' }
            },
            revenue: { $sum: '$pricing.total' },
            orders: { $sum: 1 }
          }
        }
      ]),
      scopedRestaurantObjectIds.length > 0
        ? OrderSettlement.aggregate([
            { $match: scopedSettlementMatch },
            {
              $group: {
                _id: null,
                totalCommission: { $sum: '$adminEarning.commission' },
                totalPlatformFee: { $sum: '$adminEarning.platformFee' },
                totalDeliveryFee: { $sum: '$adminEarning.deliveryFee' },
                totalGST: { $sum: '$adminEarning.gst' }
              }
            }
          ])
        : Promise.resolve([]),
      scopedRestaurantObjectIds.length > 0
        ? OrderSettlement.aggregate([
            {
              $match: {
                ...scopedSettlementMatch,
                createdAt: { $gte: last30Days, $lte: now }
              }
            },
            {
              $group: {
                _id: null,
                totalCommission: { $sum: '$adminEarning.commission' },
                totalPlatformFee: { $sum: '$adminEarning.platformFee' },
                totalDeliveryFee: { $sum: '$adminEarning.deliveryFee' },
                totalGST: { $sum: '$adminEarning.gst' }
              }
            }
          ])
        : Promise.resolve([]),
      scopedRestaurantObjectIds.length > 0
        ? OrderSettlement.aggregate([
            { $match: scopedSettlementMatch },
            {
              $lookup: {
                from: 'orders',
                localField: 'orderId',
                foreignField: '_id',
                as: 'order'
              }
            },
            { $unwind: '$order' },
            {
              $match: {
                'order.status': 'delivered',
                'order.deliveredAt': { $gte: monthlyWindowStart, $lte: now }
              }
            },
            {
              $group: {
                _id: {
                  year: { $year: '$order.deliveredAt' },
                  month: { $month: '$order.deliveredAt' }
                },
                commission: { $sum: '$adminEarning.commission' }
              }
            }
          ])
        : Promise.resolve([]),
      requestedPlatform === 'mogrocery'
        ? GroceryStore.countDocuments({ isActive: true, ...(cityRegex ? { 'location.city': cityRegex } : {}) })
        : Restaurant.countDocuments({ ...restaurantPlatformQuery, isActive: true, ...(cityRegex ? { 'location.city': cityRegex } : {}) }),
      requestedPlatform === 'mogrocery'
        ? GroceryStore.countDocuments({
            ...pendingRestaurantRequestsQuery,
            ...(cityRegex
              ? {
                  $or: [
                    { 'location.city': cityRegex },
                    { 'onboarding.step1.location.city': cityRegex }
                  ]
                }
              : {})
          })
        : Restaurant.countDocuments({
            ...restaurantPlatformQuery,
            ...pendingRestaurantRequestsQuery,
            ...(cityRegex
              ? {
                  $or: [
                    { 'location.city': cityRegex },
                    { 'onboarding.step1.location.city': cityRegex }
                  ]
                }
              : {})
          }),
      requestedPlatform === 'mogrocery'
        ? GroceryStore.countDocuments({
            createdAt: { $gte: last24Hours },
            isActive: true,
            ...(cityRegex ? { 'location.city': cityRegex } : {})
          })
        : Restaurant.countDocuments({
            ...restaurantPlatformQuery,
            createdAt: { $gte: last24Hours },
            isActive: true,
            ...(cityRegex ? { 'location.city': cityRegex } : {})
          }),
      User.aggregate([
        { $match: { role: 'delivery' } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
            pending: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$isActive', false] },
                      { $eq: ['$deliveryStatus', 'pending'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      scopedRestaurantObjectIds.length > 0
        ? (await import('../../restaurant/models/Menu.js')).default.aggregate([
            { $match: { isActive: true, restaurant: { $in: scopedRestaurantObjectIds } } },
            {
              $project: {
                foodsCount: {
                  $sum: {
                    $map: {
                      input: { $ifNull: ['$sections', []] },
                      as: 'section',
                      in: {
                        $add: [
                          {
                            $size: {
                              $filter: {
                                input: { $ifNull: ['$$section.items', []] },
                                as: 'item',
                                cond: { $ne: ['$$item.approvalStatus', 'rejected'] }
                              }
                            }
                          },
                          {
                            $sum: {
                              $map: {
                                input: { $ifNull: ['$$section.subsections', []] },
                                as: 'subsection',
                                in: {
                                  $size: {
                                    $filter: {
                                      input: { $ifNull: ['$$subsection.items', []] },
                                      as: 'item',
                                      cond: { $ne: ['$$item.approvalStatus', 'rejected'] }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        ]
                      }
                    }
                  }
                },
                addonsCount: {
                  $size: {
                    $filter: {
                      input: { $ifNull: ['$addons', []] },
                      as: 'addon',
                      cond: { $ne: ['$$addon.approvalStatus', 'rejected'] }
                    }
                  }
                }
              }
            },
            {
              $group: {
                _id: null,
                totalFoods: { $sum: '$foodsCount' },
                totalAddons: { $sum: '$addonsCount' }
              }
            }
          ])
        : Promise.resolve([]),
    ]);

    const revenueData = revenueStats[0] || { totalRevenue: 0, last30DaysRevenue: 0 };
    const settlementTotals = settlementTotalsAgg[0] || {
      totalCommission: 0,
      totalPlatformFee: 0,
      totalDeliveryFee: 0,
      totalGST: 0,
    };
    const settlementLast30Days = settlementLast30DaysAgg[0] || {
      totalCommission: 0,
      totalPlatformFee: 0,
      totalDeliveryFee: 0,
      totalGST: 0,
    };

    const totalCommission = Math.round((settlementTotals.totalCommission || 0) * 100) / 100;
    const totalPlatformFee = Math.round((settlementTotals.totalPlatformFee || 0) * 100) / 100;
    const totalDeliveryFee = Math.round((settlementTotals.totalDeliveryFee || 0) * 100) / 100;
    const totalGST = Math.round((settlementTotals.totalGST || 0) * 100) / 100;

    const last30DaysCommission = Math.round((settlementLast30Days.totalCommission || 0) * 100) / 100;
    const last30DaysPlatformFee = Math.round((settlementLast30Days.totalPlatformFee || 0) * 100) / 100;
    const last30DaysDeliveryFee = Math.round((settlementLast30Days.totalDeliveryFee || 0) * 100) / 100;
    const last30DaysGST = Math.round((settlementLast30Days.totalGST || 0) * 100) / 100;

    const orderStatusMap = {};
    orderStats.forEach((stat) => {
      orderStatusMap[stat._id] = stat.count;
    });

    const deliverySummary = deliveryPartnerAgg[0] || { total: 0, active: 0, pending: 0 };
    const totalDeliveryBoys = deliverySummary.total || 0;
    const activeDeliveryPartners = deliverySummary.active || 0;
    const pendingDeliveryBoyRequests = deliverySummary.pending || 0;
    const activePartners = activeRestaurants + activeDeliveryPartners;

    const menuTotals = menuTotalsAgg[0] || { totalFoods: 0, totalAddons: 0 };
    const totalFoods = menuTotals.totalFoods || 0;
    const totalAddons = menuTotals.totalAddons || 0;

    const monthlyOrderMap = new Map(
      monthlyOrdersAgg.map((row) => [
        `${row?._id?.year}-${row?._id?.month}`,
        { revenue: row.revenue || 0, orders: row.orders || 0 }
      ])
    );
    const monthlyCommissionMap = new Map(
      monthlySettlementAgg.map((row) => [
        `${row?._id?.year}-${row?._id?.month}`,
        row.commission || 0
      ])
    );
    const monthlyData = monthSeries.map((seriesItem) => {
      const ordersForMonth = monthlyOrderMap.get(seriesItem.key) || { revenue: 0, orders: 0 };
      const commissionForMonth = monthlyCommissionMap.get(seriesItem.key) || 0;
      return {
        month: seriesItem.label,
        revenue: Math.round((ordersForMonth.revenue || 0) * 100) / 100,
        commission: Math.round((commissionForMonth || 0) * 100) / 100,
        orders: ordersForMonth.orders || 0,
      };
    });

    const totalCustomers = distinctScopedCustomers.length;
    const totalRestaurants = activeRestaurants;
    const pendingOrders = orderStatusMap.pending || 0;
    const completedOrders = orderStatusMap.delivered || 0;

    return successResponse(res, 200, 'Dashboard stats retrieved successfully', {
      revenue: {
        total: revenueData.totalRevenue || 0,
        last30Days: revenueData.last30DaysRevenue || 0,
        currency: 'INR'
      },
      commission: {
        total: totalCommission,
        last30Days: last30DaysCommission,
        currency: 'INR'
      },
      platformFee: {
        total: totalPlatformFee,
        last30Days: last30DaysPlatformFee,
        currency: 'INR'
      },
      deliveryFee: {
        total: totalDeliveryFee,
        last30Days: last30DaysDeliveryFee,
        currency: 'INR'
      },
      gst: {
        total: totalGST,
        last30Days: last30DaysGST,
        currency: 'INR'
      },
      totalAdminEarnings: {
        total: totalCommission + totalPlatformFee + totalDeliveryFee + totalGST,
        last30Days: last30DaysCommission + last30DaysPlatformFee + last30DaysDeliveryFee + last30DaysGST,
        currency: 'INR'
      },
      orders: {
        total: totalOrders,
        byStatus: {
          pending: orderStatusMap.pending || 0,
          confirmed: orderStatusMap.confirmed || 0,
          preparing: orderStatusMap.preparing || 0,
          ready: orderStatusMap.ready || 0,
          out_for_delivery: orderStatusMap.out_for_delivery || 0,
          delivered: orderStatusMap.delivered || 0,
          cancelled: orderStatusMap.cancelled || 0
        }
      },
      partners: {
        total: activePartners,
        restaurants: activeRestaurants,
        delivery: activeDeliveryPartners
      },
      recentActivity: {
        orders: recentOrders,
        restaurants: recentRestaurants,
        period: 'last24Hours'
      },
      monthlyData: monthlyData, // Add monthly data for graphs
      // Additional stats
      restaurants: {
        total: totalRestaurants,
        active: activeRestaurants,
        pendingRequests: pendingRestaurantRequests
      },
      deliveryBoys: {
        total: totalDeliveryBoys,
        active: activeDeliveryPartners,
        pendingRequests: pendingDeliveryBoyRequests
      },
      foods: {
        total: totalFoods
      },
      addons: {
        total: totalAddons
      },
      customers: {
        total: totalCustomers
      },
      orderStats: {
        pending: pendingOrders,
        completed: completedOrders
      }
    });
  } catch (error) {
    logger.error(`Error fetching dashboard stats: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch dashboard statistics');
  }
});

/**
 * Get All Admins
 * GET /api/admin/admins
 */
export const getAdmins = asyncHandler(async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const admins = await Admin.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const total = await Admin.countDocuments(query);

    return successResponse(res, 200, 'Admins retrieved successfully', {
      admins,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error(`Error fetching admins: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch admins');
  }
});

/**
 * Get Admin by ID
 * GET /api/admin/admins/:id
 */
export const getAdminById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id)
      .select('-password')
      .lean();

    if (!admin) {
      return errorResponse(res, 404, 'Admin not found');
    }

    return successResponse(res, 200, 'Admin retrieved successfully', { admin });
  } catch (error) {
    logger.error(`Error fetching admin: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch admin');
  }
});

/**
 * Create Admin (only by existing admin)
 * POST /api/admin/admins
 */
export const createAdmin = asyncHandler(async (req, res) => {
  try {
    await Admin.ensureLegacyIndexesCleaned();

    const { name, email, password, phone, role, sidebarAccess } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = phone !== undefined ? String(phone || "").trim() : undefined;

    // Validation
    if (!name || !email || !password) {
      return errorResponse(res, 400, 'Name, email, and password are required');
    }

    if (password.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters long');
    }

    // Check if admin already exists with this email
    const existingAdmin = await Admin.findOne({ email: normalizedEmail });
    if (existingAdmin) {
      return errorResponse(res, 400, 'Admin already exists with this email');
    }
    if (normalizedPhone) {
      const existingPhoneAdmin = await Admin.findOne({ phone: normalizedPhone });
      if (existingPhoneAdmin) {
        return errorResponse(res, 400, 'Admin already exists with this phone number');
      }
    }

    // Create new admin
    const adminData = {
      name,
      email: normalizedEmail,
      password,
      isActive: true,
      phoneVerified: false,
      role: role === 'super_admin' ? 'super_admin' : (role === 'moderator' ? 'moderator' : 'admin'),
      sidebarAccess: normalizeSidebarAccess(sidebarAccess)
    };

    if (normalizedPhone) {
      adminData.phone = normalizedPhone;
    }

    const admin = await Admin.create(adminData);

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin created: ${admin._id}`, { email, createdBy: req.user._id });

    return successResponse(res, 201, 'Admin created successfully', {
      admin: adminResponse
    });
  } catch (error) {
    logger.error(`Error creating admin: ${error.message}`);
    
    if (error.code === 11000) {
      const duplicateField = resolveDuplicateAdminField(error);
      const duplicateValue = resolveDuplicateAdminValue(error, duplicateField);
      const suffix = duplicateValue !== null && duplicateValue !== undefined && String(duplicateValue) !== ""
        ? ` (${duplicateValue})`
        : "";
      if (duplicateField === 'phone') {
        return errorResponse(res, 400, `Admin with this phone number already exists${suffix}`);
      }
      if (duplicateField === 'email') {
        return errorResponse(res, 400, `Admin with this email already exists${suffix}`);
      }
      return errorResponse(res, 400, `Admin with duplicate ${duplicateField} already exists${suffix}`);
    }
    
    return errorResponse(res, 500, 'Failed to create admin');
  }
});

/**
 * Update Admin
 * PUT /api/admin/admins/:id
 */
export const updateAdmin = asyncHandler(async (req, res) => {
  try {
    await Admin.ensureLegacyIndexesCleaned();

    const { id } = req.params;
    const { name, email, phone, isActive, role, sidebarAccess } = req.body;
    const normalizedEmail = email !== undefined ? String(email || '').trim().toLowerCase() : undefined;
    const normalizedPhone = phone !== undefined ? String(phone || '').trim() : undefined;

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, 'Admin not found');
    }

    // Prevent updating own account's isActive status
    if (id === req.user._id.toString() && isActive === false) {
      return errorResponse(res, 400, 'You cannot deactivate your own account');
    }

    // Update fields
    if (name) admin.name = name;
    if (normalizedEmail) admin.email = normalizedEmail;
    if (phone !== undefined) admin.phone = normalizedPhone || undefined;
    if (isActive !== undefined) admin.isActive = isActive;
    if (role && ['super_admin', 'admin', 'moderator'].includes(role)) {
      admin.role = role;
    }
    if (sidebarAccess !== undefined) {
      admin.sidebarAccess = normalizeSidebarAccess(sidebarAccess);
    }

    await admin.save();

    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin updated: ${id}`, { updatedBy: req.user._id });

    return successResponse(res, 200, 'Admin updated successfully', {
      admin: adminResponse
    });
  } catch (error) {
    logger.error(`Error updating admin: ${error.message}`);
    
    if (error.code === 11000) {
      const duplicateField = resolveDuplicateAdminField(error);
      const duplicateValue = resolveDuplicateAdminValue(error, duplicateField);
      const suffix = duplicateValue !== null && duplicateValue !== undefined && String(duplicateValue) !== ""
        ? ` (${duplicateValue})`
        : "";
      if (duplicateField === 'phone') {
        return errorResponse(res, 400, `Admin with this phone number already exists${suffix}`);
      }
      if (duplicateField === 'email') {
        return errorResponse(res, 400, `Admin with this email already exists${suffix}`);
      }
      return errorResponse(res, 400, `Admin with duplicate ${duplicateField} already exists${suffix}`);
    }
    
    return errorResponse(res, 500, 'Failed to update admin');
  }
});

/**
 * Delete Admin
 * DELETE /api/admin/admins/:id
 */
export const deleteAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting own account
    if (id === req.user._id.toString()) {
      return errorResponse(res, 400, 'You cannot delete your own account');
    }

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, 'Admin not found');
    }

    await Admin.deleteOne({ _id: id });

    logger.info(`Admin deleted: ${id}`, { deletedBy: req.user._id });

    return successResponse(res, 200, 'Admin deleted successfully');
  } catch (error) {
    logger.error(`Error deleting admin: ${error.message}`);
    return errorResponse(res, 500, 'Failed to delete admin');
  }
});

/**
 * Get Current Admin Profile
 * GET /api/admin/profile
 */
export const getAdminProfile = asyncHandler(async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id)
      .select('-password')
      .lean();

    if (!admin) {
      return errorResponse(res, 404, 'Admin profile not found');
    }

    return successResponse(res, 200, 'Admin profile retrieved successfully', {
      admin
    });
  } catch (error) {
    logger.error(`Error fetching admin profile: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch admin profile');
  }
});

/**
 * Update Current Admin Profile
 * PUT /api/admin/profile
 */
export const updateAdminProfile = asyncHandler(async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;

    const admin = await Admin.findById(req.user._id);

    if (!admin) {
      return errorResponse(res, 404, 'Admin profile not found');
    }

    // Update fields (email cannot be changed via profile update)
    if (name !== undefined && name !== null) {
      const trimmedName = name.trim();
      
      // Validate name - only letters, spaces, apostrophes, and hyphens
      const nameRegex = /^[a-zA-Z\s'-]+$/;
      if (!nameRegex.test(trimmedName)) {
        return errorResponse(res, 400, 'Full Name can only contain letters, spaces, apostrophes, and hyphens');
      }
      
      if (trimmedName.length < 2) {
        return errorResponse(res, 400, 'Full Name must be at least 2 characters long');
      }
      
      admin.name = trimmedName;
    }
    
    if (phone !== undefined) {
      // Allow empty string to clear phone number
      if (phone && phone.trim()) {
        const phoneDigits = phone.trim().replace(/\D/g, '');
        
        // Validate phone - must be exactly 10 digits
        if (phoneDigits.length !== 10) {
          return errorResponse(res, 400, 'Phone Number must be exactly 10 digits');
        }
        
        admin.phone = phoneDigits;
      } else {
        admin.phone = null;
      }
    }
    
    if (profileImage !== undefined) {
      // Allow empty string to clear profile image
      admin.profileImage = profileImage || null;
    }

    // Save to database
    await admin.save();

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin profile updated: ${admin._id}`, {
      updatedFields: { name, phone, profileImage: profileImage ? 'updated' : 'not changed' }
    });

    return successResponse(res, 200, 'Profile updated successfully', {
      admin: adminResponse
    });
  } catch (error) {
    logger.error(`Error updating admin profile: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update profile');
  }
});

/**
 * Change Admin Password
 * PUT /api/admin/settings/change-password
 */
export const changeAdminPassword = asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return errorResponse(res, 400, 'Current password and new password are required');
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 400, 'New password must be at least 6 characters long');
    }

    // Get admin with password field
    const admin = await Admin.findById(req.user._id).select('+password');

    if (!admin) {
      return errorResponse(res, 404, 'Admin not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return errorResponse(res, 401, 'Current password is incorrect');
    }

    // Check if new password is same as current
    const isSamePassword = await admin.comparePassword(newPassword);
    if (isSamePassword) {
      return errorResponse(res, 400, 'New password must be different from current password');
    }

    // Update password (pre-save hook will hash it)
    admin.password = newPassword;
    await admin.save();

    logger.info(`Admin password changed: ${admin._id}`);

    return successResponse(res, 200, 'Password changed successfully');
  } catch (error) {
    logger.error(`Error changing admin password: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to change password');
  }
});

/**
 * Get All Users (Customers) with Order Statistics
 * GET /api/admin/users
 */
export const getUsers = asyncHandler(async (req, res) => {
  try {
    const { limit = 100, offset = 0, search, status, sortBy, orderDate, joiningDate } = req.query;
    const User = (await import('../../auth/models/User.js')).default;

    // Build query
    const query = { role: 'user' }; // Only get users, not restaurants/delivery/admins
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    // Joining date filter
    if (joiningDate) {
      const startDate = new Date(joiningDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(joiningDate);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    // Get users
    const users = await User.find(query)
      .select('-password -__v')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Get user IDs
    const userIds = users.map(user => user._id);

    // Get order statistics for each user
    const orderStats = await Order.aggregate([
      {
        $match: {
          userId: { $in: userIds }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: '$pricing.total' }
        }
      }
    ]);

    // Create a map of userId -> stats
    const statsMap = {};
    orderStats.forEach(stat => {
      statsMap[stat._id.toString()] = {
        totalOrder: stat.totalOrders || 0,
        totalOrderAmount: stat.totalAmount || 0
      };
    });

    // Format users with order statistics
    const formattedUsers = users.map((user, index) => {
      const stats = statsMap[user._id.toString()] || { totalOrder: 0, totalOrderAmount: 0 };
      
      // Format joining date
      const joiningDate = new Date(user.createdAt);
      const formattedDate = joiningDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      return {
        sl: parseInt(offset) + index + 1,
        id: user._id.toString(),
        name: user.name || 'N/A',
        email: user.email || 'N/A',
        phone: user.phone || 'N/A',
        totalOrder: stats.totalOrder,
        totalOrderAmount: stats.totalOrderAmount,
        joiningDate: formattedDate,
        status: user.isActive !== false, // Default to true if not set
        createdAt: user.createdAt
      };
    });

    // Apply sorting
    if (sortBy) {
      if (sortBy === 'name-asc') {
        formattedUsers.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === 'name-desc') {
        formattedUsers.sort((a, b) => b.name.localeCompare(a.name));
      } else if (sortBy === 'orders-asc') {
        formattedUsers.sort((a, b) => a.totalOrder - b.totalOrder);
      } else if (sortBy === 'orders-desc') {
        formattedUsers.sort((a, b) => b.totalOrder - a.totalOrder);
      }
    }

    // Order date filter (filter by order date after aggregation)
    let filteredUsers = formattedUsers;
    if (orderDate) {
      // This would require additional query to filter by order date
      // For now, we'll skip this as it's complex and may require different approach
    }

    const total = await User.countDocuments(query);

    return successResponse(res, 200, 'Users retrieved successfully', {
      users: filteredUsers,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch users');
  }
});

/**
 * Get User by ID with Full Details
 * GET /api/admin/users/:id
 */
export const getUserById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const User = (await import('../../auth/models/User.js')).default;

    const user = await User.findById(id)
      .select('-password -__v')
      .lean();

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Get order statistics
    const orderStats = await Order.aggregate([
      {
        $match: { userId: user._id }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: '$pricing.total' },
          orders: {
            $push: {
              orderId: '$orderId',
              status: '$status',
              total: '$pricing.total',
              createdAt: '$createdAt',
              restaurantName: '$restaurantName'
            }
          }
        }
      }
    ]);

    const stats = orderStats[0] || { totalOrders: 0, totalAmount: 0, orders: [] };

    // Format joining date
    const joiningDate = new Date(user.createdAt);
    const formattedDate = joiningDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return successResponse(res, 200, 'User retrieved successfully', {
      user: {
        id: user._id.toString(),
        name: user.name || 'N/A',
        email: user.email || 'N/A',
        phone: user.phone || 'N/A',
        phoneVerified: user.phoneVerified || false,
        profileImage: user.profileImage || null,
        role: user.role,
        signupMethod: user.signupMethod,
        isActive: user.isActive !== false,
        addresses: user.addresses || [],
        preferences: user.preferences || {},
        wallet: user.wallet || {},
        dateOfBirth: user.dateOfBirth || null,
        anniversary: user.anniversary || null,
        gender: user.gender || null,
        joiningDate: formattedDate,
        createdAt: user.createdAt,
        totalOrders: stats.totalOrders,
        totalOrderAmount: stats.totalAmount,
        orders: stats.orders.slice(0, 10) // Last 10 orders
      }
    });
  } catch (error) {
    logger.error(`Error fetching user: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch user');
  }
});

/**
 * Update User Status (Active/Inactive)
 * PUT /api/admin/users/:id/status
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const User = (await import('../../auth/models/User.js')).default;

    if (typeof isActive !== 'boolean') {
      return errorResponse(res, 400, 'isActive must be a boolean value');
    }

    const user = await User.findById(id);

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    user.isActive = isActive;
    await user.save();

    logger.info(`User status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id
    });

    return successResponse(res, 200, 'User status updated successfully', {
      user: {
        id: user._id.toString(),
        name: user.name,
        isActive: user.isActive
      }
    });
  } catch (error) {
    logger.error(`Error updating user status: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update user status');
  }
});

/**
 * Get All Restaurants
 * GET /api/admin/restaurants
 * Query params: page, limit, search, status, cuisine, zone
 */
export const getRestaurants = asyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50,
      search,
      status,
      cuisine,
      zone,
      city
    } = req.query;

    // Build query
    const query = {
      $or: [
        { platform: 'mofood' },
        { platform: { $exists: false } }
      ]
    };

    // Status filter - Show all restaurants by default, filter only when explicitly requested
    // This allows admin to see and manage both active and inactive restaurants
    if (status === 'inactive') {
      query.isActive = false;
    } else if (status === 'active') {
      query.isActive = true;
    }
    // If status is not provided or is 'all', show all restaurants (both active and inactive)

    console.log('🔍 Admin Restaurants List Query:', {
      status,
      isActive: query.isActive,
      query: JSON.stringify(query, null, 2)
    });

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { ownerPhone: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Cuisine filter
    if (cuisine) {
      query.cuisines = { $in: [new RegExp(cuisine, 'i')] };
    }

    if (city) {
      const cityRegex = buildCityRegex(city);
      if (cityRegex) {
        query.$and = [
          ...(Array.isArray(query.$and) ? query.$and : []),
          {
            $or: [
              { 'location.city': cityRegex },
              { 'onboarding.step1.location.city': cityRegex }
            ]
          }
        ];
      }
    }

    // Zone filter
    if (zone && zone !== 'All over the World') {
      query.$and = [
        ...(Array.isArray(query.$and) ? query.$and : []),
        {
          $or: [
            { 'location.area': { $regex: zone, $options: 'i' } },
            { 'location.city': { $regex: zone, $options: 'i' } },
            { 'onboarding.step1.location.area': { $regex: zone, $options: 'i' } },
            { 'onboarding.step1.location.city': { $regex: zone, $options: 'i' } }
          ]
        }
      ];
    }

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    // Fetch restaurants
    const restaurants = await Restaurant.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const normalizedRestaurants = restaurants.map(normalizeRestaurantAddressRecord);

    // Get total count
    const total = await Restaurant.countDocuments(query);

    return successResponse(res, 200, 'Restaurants retrieved successfully', {
      restaurants: normalizedRestaurants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching restaurants: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch restaurants');
  }
});

export const getRestaurantById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findById(id)
      .select('-password')
      .lean();

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    const outletTimingsDoc = await OutletTimings.findOne({
      restaurantId: restaurant._id,
      isActive: true,
    })
      .select('outletType timings isActive')
      .lean();

    return successResponse(res, 200, 'Restaurant retrieved successfully', {
      restaurant: {
        ...normalizeRestaurantAddressRecord(restaurant),
        outletTimings: outletTimingsDoc?.timings || [],
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch restaurant');
  }
});

/**
 * Update Restaurant Status (Active/Inactive/Ban)
 * PUT /api/admin/restaurants/:id/status
 */
export const updateRestaurantStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return errorResponse(res, 400, 'isActive must be a boolean value');
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    restaurant.isActive = isActive;
    await restaurant.save();

    logger.info(`Restaurant status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id
    });

    return successResponse(res, 200, 'Restaurant status updated successfully', {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive
      }
    });
  } catch (error) {
    logger.error(`Error updating restaurant status: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update restaurant status');
  }
});

/**
 * Update Restaurant Details
 * PUT /api/admin/restaurants/:id
 */
export const updateRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      ownerName,
      ownerPhone,
      ownerEmail,
      primaryContactNumber,
      location,
      profileImage,
      outletTimings
    } = req.body || {};

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    const updateData = {};

    if (name !== undefined) {
      const normalizedName = String(name || '').trim();
      updateData.name = normalizedName;

      // Keep slug synced with the current restaurant name when admin edits it.
      if (normalizedName && (normalizedName !== restaurant.name || !restaurant.slug)) {
        let baseSlug = normalizedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        if (!baseSlug) {
          baseSlug = restaurant.slug || `restaurant-${String(restaurant._id).slice(-6)}`;
        }

        let candidateSlug = baseSlug;
        let counter = 1;
        while (await Restaurant.findOne({ slug: candidateSlug, _id: { $ne: restaurant._id } }).select('_id').lean()) {
          candidateSlug = `${baseSlug}-${counter}`;
          counter += 1;
        }

        updateData.slug = candidateSlug;
      }
    }
    if (ownerName !== undefined) updateData.ownerName = String(ownerName || '').trim();
    if (ownerPhone !== undefined) updateData.ownerPhone = String(ownerPhone || '').trim();
    if (ownerEmail !== undefined) updateData.ownerEmail = String(ownerEmail || '').trim();
    if (primaryContactNumber !== undefined) {
      updateData.primaryContactNumber = String(primaryContactNumber || '').trim();
    }

    if (location && typeof location === 'object') {
      const nextLocation = {
        ...(restaurant.location?.toObject ? restaurant.location.toObject() : restaurant.location || {}),
      };

      const locationKeys = [
        'addressLine1',
        'addressLine2',
        'area',
        'city',
        'state',
        'pincode',
        'zipCode',
        'postalCode',
        'address',
        'formattedAddress',
        'landmark',
        'street'
      ];

      locationKeys.forEach((key) => {
        if (location[key] !== undefined) {
          nextLocation[key] = location[key];
        }
      });

      const lat = Number(location.latitude);
      const lng = Number(location.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        nextLocation.latitude = lat;
        nextLocation.longitude = lng;
        nextLocation.coordinates = [lng, lat];
      } else if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
        const coordLng = Number(location.coordinates[0]);
        const coordLat = Number(location.coordinates[1]);
        if (Number.isFinite(coordLat) && Number.isFinite(coordLng)) {
          nextLocation.latitude = coordLat;
          nextLocation.longitude = coordLng;
          nextLocation.coordinates = [coordLng, coordLat];
        }
      }

      updateData.location = nextLocation;
    }

    if (profileImage && typeof profileImage === 'object' && profileImage.url) {
      updateData.profileImage = {
        url: profileImage.url,
        publicId: profileImage.publicId || '',
      };
    }

    let normalizedOutletTimings = null;
    if (outletTimings !== undefined) {
      normalizedOutletTimings = normalizeOutletTimingsPayload(outletTimings, {
        openingTime: restaurant?.deliveryTimings?.openingTime || '09:00',
        closingTime: restaurant?.deliveryTimings?.closingTime || '22:00',
        openDays: restaurant?.openDays || [],
      });
      const derived = deriveRestaurantTimingFieldsFromOutletTimings(normalizedOutletTimings);
      updateData.openDays = derived.openDays;
      updateData.deliveryTimings = derived.deliveryTimings;
      updateData.isAcceptingOrders = derived.openDays.length > 0;
    }

    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .select('-password')
      .lean();

    let outletTimingsDoc = null;
    if (normalizedOutletTimings) {
      outletTimingsDoc = await OutletTimings.findOneAndUpdate(
        { restaurantId: updatedRestaurant._id },
        {
          $set: {
            outletType: 'MoBasket delivery',
            timings: normalizedOutletTimings,
            isActive: true,
          },
        },
        { upsert: true, new: true, runValidators: true }
      )
        .select('outletType timings isActive')
        .lean();
    } else {
      outletTimingsDoc = await OutletTimings.findOne({
        restaurantId: updatedRestaurant._id,
        isActive: true,
      })
        .select('outletType timings isActive')
        .lean();
    }

    logger.info(`Restaurant updated: ${id}`, {
      updatedBy: req.user._id,
      fields: Object.keys(updateData),
    });

    return successResponse(res, 200, 'Restaurant updated successfully', {
      restaurant: {
        ...normalizeRestaurantAddressRecord(updatedRestaurant),
        outletTimings: outletTimingsDoc?.timings || [],
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update restaurant');
  }
});

/**
 * Get Restaurant Join Requests
 * GET /api/admin/restaurants/requests
 * Query params: status (pending, rejected), page, limit, search
 */
export const getRestaurantJoinRequests = asyncHandler(async (req, res) => {
  try {
    const {
      status = 'pending',
      page = 1,
      limit = 50,
      search,
    } = req.query;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const emptyRejectionReasonConditions = [
      { rejectionReason: { $exists: false } },
      { rejectionReason: null },
      { rejectionReason: '' },
      { rejectionReason: { $regex: /^\s*$/ } },
    ];
    const hasMeaningfulRejectionReasonCondition = {
      rejectionReason: { $regex: /\S/ },
    };

    let query = {
      isActive: false,
      approvedAt: null,
      $or: [
        { status: 'pending' },
        { 'onboarding.completedSteps': { $gte: 4 } },
      ],
    };

    if (status === 'rejected') {
      query.$and = [
        ...(query.$and || []),
        hasMeaningfulRejectionReasonCondition,
      ];
    } else {
      query.$and = [
        ...(query.$and || []),
        {
          $or: emptyRejectionReasonConditions,
        },
      ];
    }

    if (search && search.trim()) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { name: { $regex: search.trim(), $options: 'i' } },
            { ownerName: { $regex: search.trim(), $options: 'i' } },
            { ownerPhone: { $regex: search.trim(), $options: 'i' } },
            { phone: { $regex: search.trim(), $options: 'i' } },
            { email: { $regex: search.trim(), $options: 'i' } },
          ],
        },
      ];
    }

    const restaurants = await Restaurant.find(query)
      .select('-password')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const total = await Restaurant.countDocuments(query);

    const formattedRequests = restaurants.map((restaurant, index) => {
      let zone = 'All over the World';
      if (restaurant.location?.area) {
        zone = restaurant.location.area;
      } else if (restaurant.location?.city) {
        zone = restaurant.location.city;
      }

      const normalizedRejectionReason = String(restaurant.rejectionReason || '').trim();
      const hasMeaningfulRejectionReason = Boolean(normalizedRejectionReason);

      return {
        _id: restaurant._id.toString(),
        sl: skip + index + 1,
        restaurantName: restaurant.name || 'N/A',
        restaurantImage:
          restaurant.profileImage?.url ||
          restaurant.onboarding?.step2?.profileImageUrl?.url ||
          DEFAULT_IMAGE_FALLBACK_40,
        ownerName: restaurant.ownerName || 'N/A',
        ownerPhone: restaurant.ownerPhone || restaurant.phone || 'N/A',
        zone,
        businessModel: restaurant.businessModel || 'Commission Base',
        status: hasMeaningfulRejectionReason ? 'Rejected' : 'Pending',
        rejectionReason: hasMeaningfulRejectionReason ? normalizedRejectionReason : null,
        createdAt: restaurant.createdAt,
        fullData: {
          ...restaurant,
          _id: restaurant._id.toString(),
        },
      };
    });

    return successResponse(res, 200, 'Restaurant join requests retrieved successfully', {
      requests: formattedRequests,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurant join requests: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch restaurant join requests');
  }
});

/**
 * Approve Restaurant Join Request
 * POST /api/admin/restaurants/:id/approve
 */
export const approveRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    if (restaurant.isActive) {
      return errorResponse(res, 400, 'Restaurant is already approved');
    }

    if (String(restaurant.rejectionReason || '').trim()) {
      return errorResponse(res, 400, 'Cannot approve a rejected restaurant. Please remove rejection reason first.');
    }

    // Activate restaurant and normalize verification status so frontend
    // dashboards stop treating an approved submission as still pending.
    restaurant.isActive = true;
    restaurant.status = 'active';
    restaurant.approvedAt = new Date();
    restaurant.approvedBy = adminId;
    restaurant.rejectionReason = undefined; // Clear any previous rejection
    restaurant.rejectedAt = null;
    restaurant.rejectedBy = null;

    await restaurant.save();

    logger.info(`Restaurant approved: ${id}`, {
      approvedBy: adminId,
      restaurantName: restaurant.name
    });

    return successResponse(res, 200, 'Restaurant approved successfully', {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
        approvedAt: restaurant.approvedAt
      }
    });
  } catch (error) {
    logger.error(`Error approving restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to approve restaurant');
  }
});

/**
 * Reject Restaurant Join Request
 * POST /api/admin/restaurants/:id/reject
 */
export const rejectRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    // Validate reason is provided
    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, 'Rejection reason is required');
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Set rejection details (allow updating if already rejected)
    restaurant.rejectionReason = reason.trim();
    restaurant.rejectedAt = new Date();
    restaurant.rejectedBy = adminId;
    restaurant.isActive = false; // Ensure it's inactive

    await restaurant.save();

    logger.info(`Restaurant rejected: ${id}`, {
      rejectedBy: adminId,
      reason: reason,
      restaurantName: restaurant.name
    });

    return successResponse(res, 200, 'Restaurant rejected successfully', {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        rejectionReason: restaurant.rejectionReason
      }
    });
  } catch (error) {
    logger.error(`Error rejecting restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reject restaurant');
  }
});

/**
 * Get Grocery Store Join Requests
 * GET /api/admin/grocery-stores/requests
 * Query params: status (pending, rejected), page, limit, search
 */
export const getGroceryStoreJoinRequests = asyncHandler(async (req, res) => {
  try {
    const { 
      status = 'pending', 
      page = 1, 
      limit = 50,
      search
    } = req.query;

    let query = {};
    const emptyRejectionReasonConditions = [
      { rejectionReason: { $exists: false } },
      { rejectionReason: null },
      { rejectionReason: '' },
      { rejectionReason: { $regex: /^\s*$/ } }
    ];
    const hasMeaningfulRejectionReasonCondition = {
      rejectionReason: { $regex: /\S/ }
    };
    const hasOnboardingSubmissionCondition = {
      $or: [
        { 'onboarding.completedSteps': { $gte: 1 } },
        { 'onboarding.step1': { $exists: true } },
        { 'onboarding.step2': { $exists: true } },
        { 'onboarding.step3': { $exists: true } },
        { 'onboarding.step4': { $exists: true } }
      ]
    };
    
    if (status === 'pending') {
      // Show only onboarded stores that are awaiting review.
      query.$and = [
        { isActive: false },
        { approvedAt: null },
        hasOnboardingSubmissionCondition,
        { $or: emptyRejectionReasonConditions }
      ];
    } else if (status === 'rejected') {
      query.$and = [
        { isActive: false },
        { approvedAt: null },
        hasOnboardingSubmissionCondition,
        hasMeaningfulRejectionReasonCondition
      ];
    }

    if (search && search.trim()) {
      const searchConditions = {
        $or: [
          { name: { $regex: search.trim(), $options: 'i' } },
          { ownerName: { $regex: search.trim(), $options: 'i' } },
          { ownerPhone: { $regex: search.trim(), $options: 'i' } },
          { phone: { $regex: search.trim(), $options: 'i' } },
          { email: { $regex: search.trim(), $options: 'i' } }
        ]
      };
      
      if (query.$and) {
        query.$and.push(searchConditions);
      } else {
        const baseConditions = { ...query };
        query = {
          $and: [
            baseConditions,
            searchConditions
          ]
        };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const stores = await GroceryStore.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await GroceryStore.countDocuments(query);

    const formattedRequests = stores.map((store, index) => {
      let zone = 'All over the World';
      if (store.location?.area) {
        zone = store.location.area;
      } else if (store.location?.city) {
        zone = store.location.city;
      }

      const normalizedRejectionReason = String(store.rejectionReason || '').trim();
      const hasMeaningfulRejectionReason = Boolean(normalizedRejectionReason);

      return {
        _id: store._id.toString(),
        sl: skip + index + 1,
        storeName: store.name || 'N/A',
        storeImage: store.profileImage?.url || store.onboarding?.storeImage?.url || DEFAULT_IMAGE_FALLBACK_40,
        ownerName: store.ownerName || 'N/A',
        ownerPhone: store.ownerPhone || store.phone || 'N/A',
        zone: zone,
        status: hasMeaningfulRejectionReason ? 'Rejected' : 'Pending',
        rejectionReason: hasMeaningfulRejectionReason ? normalizedRejectionReason : null,
        createdAt: store.createdAt,
        fullData: {
          ...store,
          _id: store._id.toString()
        }
      };
    });

    return successResponse(res, 200, 'Grocery store join requests retrieved successfully', {
      requests: formattedRequests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching grocery store join requests: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch grocery store join requests');
  }
});

/**
 * Approve Grocery Store Join Request
 * POST /api/admin/grocery-stores/:id/approve
 */
export const approveGroceryStore = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const store = await GroceryStore.findById(id);

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    if (store.isActive) {
      return errorResponse(res, 400, 'Grocery store is already active');
    }

    store.isActive = true;
    store.approvedAt = new Date();
    store.approvedBy = adminId;
    store.rejectionReason = null;
    store.rejectedAt = null;
    store.rejectedBy = null;

    await store.save();

    logger.info(`Grocery store approved: ${id}`, {
      approvedBy: adminId,
      storeName: store.name
    });

    return successResponse(res, 200, 'Grocery store approved successfully', {
      store: {
        id: store._id.toString(),
        name: store.name,
        isActive: store.isActive
      }
    });
  } catch (error) {
    logger.error(`Error approving grocery store: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to approve grocery store');
  }
});

/**
 * Reject Grocery Store Join Request
 * POST /api/admin/grocery-stores/:id/reject
 */
export const rejectGroceryStore = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, 'Rejection reason is required');
    }

    const store = await GroceryStore.findById(id);

    if (!store) {
      return errorResponse(res, 404, 'Grocery store not found');
    }

    store.rejectionReason = reason.trim();
    store.rejectedAt = new Date();
    store.rejectedBy = adminId;
    store.isActive = false;

    await store.save();

    logger.info(`Grocery store rejected: ${id}`, {
      rejectedBy: adminId,
      reason: reason,
      storeName: store.name
    });

    return successResponse(res, 200, 'Grocery store rejected successfully', {
      store: {
        id: store._id.toString(),
        name: store.name,
        rejectionReason: store.rejectionReason
      }
    });
  } catch (error) {
    logger.error(`Error rejecting grocery store: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reject grocery store');
  }
});

/**
 * Reverify Restaurant (Resubmit for approval)
 * POST /api/admin/restaurants/:id/reverify
 */
export const reverifyRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Check if restaurant was rejected
    if (!String(restaurant.rejectionReason || '').trim()) {
      return errorResponse(res, 400, 'Restaurant is not rejected. Only rejected restaurants can be reverified.');
    }

    // Clear rejection details and mark as pending again
    restaurant.rejectionReason = null;
    restaurant.rejectedAt = null;
    restaurant.rejectedBy = null;
    restaurant.approvedAt = null;
    restaurant.approvedBy = null;
    restaurant.status = 'pending';
    restaurant.isActive = false; // Keep inactive until approved

    await restaurant.save();

    logger.info(`Restaurant reverified: ${id}`, {
      reverifiedBy: adminId,
      restaurantName: restaurant.name
    });

    return successResponse(res, 200, 'Restaurant reverified successfully. Waiting for admin approval.', {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
        rejectionReason: null
      }
    });
  } catch (error) {
    logger.error(`Error reverifying restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reverify restaurant');
  }
});

/**
 * Create Restaurant by Admin
 * POST /api/admin/restaurants
 */
export const createRestaurant = asyncHandler(async (req, res) => {
  try {
    const adminId = req.user._id;
    const {
      // Step 1: Basic Info
      restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone,
      primaryContactNumber,
      location,
      // Step 2: Images & Operational
      menuImages, // Array of image URLs or base64
      profileImage, // Image URL or base64
      cuisines,
      openingTime,
      closingTime,
      openDays,
      outletTimings,
      // Step 3: Documents
      panNumber,
      nameOnPan,
      panImage, // Image URL or base64
      gstRegistered,
      gstNumber,
      gstLegalName,
      gstAddress,
      gstImage, // Image URL or base64
      fssaiNumber,
      fssaiExpiry,
      fssaiImage, // Image URL or base64
      accountNumber,
      ifscCode,
      accountHolderName,
      accountType,
      // Step 4: Display Info
      estimatedDeliveryTime,
      featuredDish,
      featuredPrice,
      offer,
      // Authentication
      email,
      phone,
      password,
      signupMethod = 'email'
    } = req.body;

    // Validation
    if (!restaurantName || !ownerName || !ownerEmail) {
      return errorResponse(res, 400, 'Restaurant name, owner name, and owner email are required');
    }

    if (!email && !phone) {
      return errorResponse(res, 400, 'Either email or phone is required');
    }

    // Normalize phone number if provided
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }

    // Generate random password if email is provided but password is not
    let finalPassword = password;
    if (email && !password) {
      // Generate a random 12-character password
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      finalPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    // Check if restaurant already exists with same email or phone
    const existingRestaurant = await Restaurant.findOne({
      $or: [
        ...(email ? [{ email: email.toLowerCase().trim() }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])
      ]
    });

    if (existingRestaurant) {
      if (email && existingRestaurant.email === email.toLowerCase().trim()) {
        return errorResponse(res, 400, 'Restaurant with this email already exists');
      }
      if (normalizedPhone && existingRestaurant.phone === normalizedPhone) {
        return errorResponse(res, 400, 'Restaurant with this phone number already exists. Please use a different phone number.');
      }
    }

    // Initialize Cloudinary
    await initializeCloudinary();

    // Upload images if provided as base64 or files
    let profileImageData = null;
    if (profileImage) {
      if (typeof profileImage === 'string' && profileImage.startsWith('data:')) {
        // Base64 image - convert to buffer and upload
        const base64Data = profileImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadToCloudinary(buffer, {
          folder: 'mobasket/restaurant/profile',
          resource_type: 'image'
        });
        profileImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof profileImage === 'string' && profileImage.startsWith('http')) {
        // Already a URL
        profileImageData = { url: profileImage };
      } else if (profileImage.url) {
        // Already an object with url
        profileImageData = profileImage;
      }
    }

    let menuImagesData = [];
    if (menuImages && Array.isArray(menuImages) && menuImages.length > 0) {
      for (const img of menuImages) {
        if (typeof img === 'string' && img.startsWith('data:')) {
          const base64Data = img.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const result = await uploadToCloudinary(buffer, {
            folder: 'mobasket/restaurant/menu',
            resource_type: 'image'
          });
          menuImagesData.push({ url: result.secure_url, publicId: result.public_id });
        } else if (typeof img === 'string' && img.startsWith('http')) {
          menuImagesData.push({ url: img });
        } else if (img.url) {
          menuImagesData.push(img);
        }
      }
    }

    // Upload document images
    let panImageData = null;
    if (panImage) {
      if (typeof panImage === 'string' && panImage.startsWith('data:')) {
        const base64Data = panImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadToCloudinary(buffer, {
          folder: 'mobasket/restaurant/pan',
          resource_type: 'image'
        });
        panImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof panImage === 'string' && panImage.startsWith('http')) {
        panImageData = { url: panImage };
      } else if (panImage.url) {
        panImageData = panImage;
      }
    }

    let gstImageData = null;
    if (gstRegistered && gstImage) {
      if (typeof gstImage === 'string' && gstImage.startsWith('data:')) {
        const base64Data = gstImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadToCloudinary(buffer, {
          folder: 'mobasket/restaurant/gst',
          resource_type: 'image'
        });
        gstImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof gstImage === 'string' && gstImage.startsWith('http')) {
        gstImageData = { url: gstImage };
      } else if (gstImage.url) {
        gstImageData = gstImage;
      }
    }

    let fssaiImageData = null;
    if (fssaiImage) {
      if (typeof fssaiImage === 'string' && fssaiImage.startsWith('data:')) {
        const base64Data = fssaiImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadToCloudinary(buffer, {
          folder: 'mobasket/restaurant/fssai',
          resource_type: 'image'
        });
        fssaiImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof fssaiImage === 'string' && fssaiImage.startsWith('http')) {
        fssaiImageData = { url: fssaiImage };
      } else if (fssaiImage.url) {
        fssaiImageData = fssaiImage;
      }
    }

    // Create restaurant data
    const restaurantData = {
      name: restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone: ownerPhone ? normalizePhoneNumber(ownerPhone) || normalizedPhone : normalizedPhone,
      primaryContactNumber: primaryContactNumber ? normalizePhoneNumber(primaryContactNumber) || normalizedPhone : normalizedPhone,
      location: location || {},
      profileImage: profileImageData,
      menuImages: menuImagesData,
      cuisines: cuisines || [],
      deliveryTimings: {
        openingTime: openingTime || '09:00',
        closingTime: closingTime || '22:00'
      },
      openDays: openDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      estimatedDeliveryTime: estimatedDeliveryTime || '25-30 mins',
      featuredDish: featuredDish || '',
      featuredPrice: featuredPrice || 249,
      offer: offer || '',
      signupMethod,
      // Admin created restaurants are active by default
      isActive: true,
      isAcceptingOrders: true,
      approvedAt: new Date(),
      approvedBy: adminId
    };

    // Add authentication fields
    if (email) {
      restaurantData.email = email.toLowerCase().trim();
      restaurantData.password = finalPassword; // Will be hashed by pre-save hook
    }
    if (normalizedPhone) {
      restaurantData.phone = normalizedPhone;
      restaurantData.phoneVerified = true; // Admin created, so verified
    }

    // Add onboarding data
    restaurantData.onboarding = {
      step1: {
        restaurantName,
        ownerName,
        ownerEmail,
        ownerPhone: ownerPhone ? normalizePhoneNumber(ownerPhone) || normalizedPhone : normalizedPhone,
        primaryContactNumber: primaryContactNumber ? normalizePhoneNumber(primaryContactNumber) || normalizedPhone : normalizedPhone,
        location: location || {}
      },
      step2: {
        menuImageUrls: menuImagesData,
        profileImageUrl: profileImageData,
        cuisines: cuisines || [],
        deliveryTimings: {
          openingTime: openingTime || '09:00',
          closingTime: closingTime || '22:00'
        },
        openDays: openDays || []
      },
      step3: {
        pan: {
          panNumber: panNumber || '',
          nameOnPan: nameOnPan || '',
          image: panImageData
        },
        gst: {
          isRegistered: gstRegistered || false,
          gstNumber: gstNumber || '',
          legalName: gstLegalName || '',
          address: gstAddress || '',
          image: gstImageData
        },
        fssai: {
          registrationNumber: fssaiNumber || '',
          expiryDate: fssaiExpiry || null,
          image: fssaiImageData
        },
        bank: {
          accountNumber: accountNumber || '',
          ifscCode: ifscCode || '',
          accountHolderName: accountHolderName || '',
          accountType: accountType || ''
        }
      },
      step4: {
        estimatedDeliveryTime: estimatedDeliveryTime || '25-30 mins',
        featuredDish: featuredDish || '',
        featuredPrice: featuredPrice || 249,
        offer: offer || ''
      },
      completedSteps: 4
    };

    // Create restaurant
    const restaurant = await Restaurant.create(restaurantData);

    const normalizedOutletTimings = normalizeOutletTimingsPayload(outletTimings, {
      openingTime: openingTime || '09:00',
      closingTime: closingTime || '22:00',
      openDays: openDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    });
    const derivedOutletTimingFields = deriveRestaurantTimingFieldsFromOutletTimings(normalizedOutletTimings);
    await Restaurant.findByIdAndUpdate(
      restaurant._id,
      {
        $set: {
          openDays: derivedOutletTimingFields.openDays,
          deliveryTimings: derivedOutletTimingFields.deliveryTimings,
          isAcceptingOrders: derivedOutletTimingFields.openDays.length > 0,
        },
      },
      { runValidators: true }
    );
    await OutletTimings.findOneAndUpdate(
      { restaurantId: restaurant._id },
      {
        $set: {
          restaurantId: restaurant._id,
          outletType: 'MoBasket delivery',
          timings: normalizedOutletTimings,
          isActive: true,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    logger.info(`Restaurant created by admin: ${restaurant._id}`, {
      createdBy: adminId,
      restaurantName: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone
    });

    // Prepare response data
    const responseData = {
      restaurant: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        isActive: restaurant.isActive,
        slug: restaurant.slug
      }
    };

    // Include generated password in response if email was provided and password was auto-generated
    // This allows admin to share the password with the restaurant
    if (email && !password && finalPassword) {
      responseData.generatedPassword = finalPassword;
      responseData.message = 'Restaurant created successfully. Please share the generated password with the restaurant.';
    }

    return successResponse(res, 201, 'Restaurant created successfully', responseData);
  } catch (error) {
    logger.error(`Error creating restaurant: ${error.message}`, { error: error.stack });
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return errorResponse(res, 400, `Restaurant with this ${field} already exists`);
    }
    
    return errorResponse(res, 500, `Failed to create restaurant: ${error.message}`);
  }
});

/**
 * Delete Restaurant
 * DELETE /api/admin/restaurants/:id
 */
export const deleteRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid restaurant id');
    }

    const restaurantObjectId = new mongoose.Types.ObjectId(id);

    const restaurant = await Restaurant.findById(restaurantObjectId);

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Admin delete from the restaurants list should remove the entity entirely.
    // Use the native collection to bypass model-level soft-delete guards.
    const deleteResult = await Restaurant.collection.deleteOne({ _id: restaurantObjectId });

    if (!deleteResult?.deletedCount) {
      return errorResponse(res, 500, 'Failed to delete restaurant');
    }

    logger.info(`Restaurant hard deleted: ${id}`, {
      deletedBy: adminId,
      restaurantName: restaurant.name
    });

    return successResponse(res, 200, 'Restaurant removed successfully', {
      restaurant: {
        id: id,
        name: restaurant.name
      }
    });
  } catch (error) {
    logger.error(`Error deleting restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to delete restaurant');
  }
});

/**
 * Delete Restaurant Addon
 * DELETE /api/admin/restaurants/:restaurantId/addons/:addonId
 */
export const deleteRestaurantAddon = asyncHandler(async (req, res) => {
  try {
    const { restaurantId, addonId } = req.params;
    const adminId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return errorResponse(res, 400, 'Invalid restaurant ID');
    }

    const Menu = (await import('../../restaurant/models/Menu.js')).default;
    
    // Find menu
    const menu = await Menu.findOne({ restaurant: restaurantId });
    
    if (!menu) {
      return errorResponse(res, 404, 'Menu not found');
    }

    // Find and remove add-on
    // Log all addon IDs for debugging
    logger.info(`Looking for addon ID: ${addonId} in menu with ${menu.addons.length} addons`);
    if (menu.addons.length > 0) {
      logger.info(`Available addon IDs: ${menu.addons.map(a => a.id).join(', ')}`);
    }
    
    const addonIndex = menu.addons.findIndex(a => {
      const menuAddonId = String(a.id || '');
      const searchId = String(addonId || '');
      return menuAddonId === searchId;
    });
    
    if (addonIndex === -1) {
      logger.warn(`Addon not found. Searched for: "${addonId}", Available IDs: ${menu.addons.map(a => `"${a.id}"`).join(', ')}`);
      return errorResponse(res, 404, `Add-on not found. Searched ID: ${addonId}`);
    }

    const addonName = menu.addons[addonIndex].name || 'Unknown';
    
    menu.addons.splice(addonIndex, 1);
    menu.markModified('addons');
    await menu.save();

    logger.info(`Restaurant addon deleted: ${addonId}`, {
      deletedBy: adminId,
      restaurantId: restaurantId,
      addonName: addonName
    });

    return successResponse(res, 200, 'Add-on deleted successfully', {
      menu: {
        addons: menu.addons,
        isActive: menu.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error deleting restaurant addon: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to delete addon');
  }
});

/**
 * Get All Offers with Restaurant and Dish Details
 * GET /api/admin/offers
 * Query params: page, limit, search, status, restaurantId
 */
export const getAllOffers = asyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50,
      search,
      status,
      restaurantId,
      platform
    } = req.query;
    const requestedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';
    let eligibleRestaurantIds = [];
    if (requestedPlatform === 'mogrocery') {
      const [restaurantEntities, groceryStores] = await Promise.all([
        Restaurant.find({ platform: 'mogrocery' }).select('_id').lean(),
        GroceryStore.find({ isActive: true }).select('_id').lean(),
      ]);
      const mergedIds = [...restaurantEntities, ...groceryStores].map((entity) => String(entity?._id || ''));
      eligibleRestaurantIds = Array.from(new Set(mergedIds))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    } else {
      const restaurantEntities = await Restaurant.find({
        $or: [{ platform: 'mofood' }, { platform: { $exists: false } }]
      }).select('_id').lean();
      eligibleRestaurantIds = restaurantEntities.map((restaurant) => restaurant._id);
    }

    // Build query
    const query = {
      restaurant: { $in: eligibleRestaurantIds }
    };
    
    if (status) {
      query.status = status;
    }
    
    if (restaurantId) {
      query.restaurant = {
        $in: eligibleRestaurantIds.filter((id) => String(id) === String(restaurantId))
      };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch offers with restaurant details
    const offers = await Offer.find(query)
      .populate('restaurant', 'name restaurantId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const unresolvedStoreIds = requestedPlatform === 'mogrocery'
      ? Array.from(
          new Set(
            offers
              .map((offer) => {
                if (offer?.restaurant && typeof offer.restaurant === 'object') {
                  return String(offer.restaurant?._id || '');
                }
                return String(offer?.restaurant || '');
              })
              .filter(Boolean)
              .filter((id) => !offers.some((offer) => String(offer?.restaurant?._id || '') === id && offer?.restaurant?.name))
          )
        )
      : [];

    let groceryStoreNameMap = new Map();
    if (unresolvedStoreIds.length > 0) {
      const stores = await GroceryStore.find({
        _id: {
          $in: unresolvedStoreIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id))
        }
      })
        .select('_id name restaurantId')
        .lean();
      groceryStoreNameMap = new Map(
        stores.map((store) => [
          String(store._id),
          {
            name: store.name || 'Unknown Store',
            restaurantId: store.restaurantId || String(store._id),
          }
        ])
      );
    }

    // Get total count
    const total = await Offer.countDocuments(query);

    // Flatten offers to show each item separately
    const offerItems = [];
    offers.forEach((offer, offerIndex) => {
      if (offer.items && offer.items.length > 0) {
        offer.items.forEach((item, itemIndex) => {
          // Apply search filter if provided
          if (search) {
            const searchLower = search.toLowerCase();
            const matchesSearch = 
              offer.restaurant?.name?.toLowerCase().includes(searchLower) ||
              item.itemName?.toLowerCase().includes(searchLower) ||
              item.couponCode?.toLowerCase().includes(searchLower);
            
            if (!matchesSearch) {
              return; // Skip this item if it doesn't match search
            }
          }

          offerItems.push({
            sl: skip + offerItems.length + 1,
            offerId: offer._id.toString(),
            restaurantName:
              offer.restaurant?.name ||
              groceryStoreNameMap.get(String(offer?.restaurant?._id || offer?.restaurant || ''))?.name ||
              'Unknown Store',
            restaurantId:
              offer.restaurant?.restaurantId ||
              groceryStoreNameMap.get(String(offer?.restaurant?._id || offer?.restaurant || ''))?.restaurantId ||
              offer.restaurant?._id?.toString() ||
              String(offer?.restaurant || 'N/A'),
            dishName: item.itemName || 'Unknown Dish',
            dishId: item.itemId || 'N/A',
            couponCode: item.couponCode || 'N/A',
            discountType: offer.discountType || 'percentage',
            discountPercentage: item.discountPercentage || 0,
            originalPrice: item.originalPrice || 0,
            discountedPrice: item.discountedPrice || 0,
            customerGroup: offer.customerGroup || 'all',
            minOrderValue: offer.minOrderValue || 0,
            maxLimit: offer.maxLimit ?? null,
            showAtCheckout: offer.showAtCheckout !== false,
            status: offer.status || 'active',
            startDate: offer.startDate || null,
            endDate: offer.endDate || null,
            createdAt: offer.createdAt || new Date(),
          });
        });
      }
    });

    // If search was applied, we need to recalculate total
    let filteredTotal = offerItems.length;
    if (!search) {
      // Count all items across all offers
      const allOffers = await Offer.find(query).lean();
      filteredTotal = allOffers.reduce((sum, offer) => sum + (offer.items?.length || 0), 0);
    }

    return successResponse(res, 200, 'Offers retrieved successfully', {
      offers: offerItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredTotal,
        pages: Math.ceil(filteredTotal / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching offers: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch offers');
  }
});

/**
 * Create coupon offer(s) for selected restaurants or all restaurants
 * POST /api/admin/offers
 */
export const createOffer = asyncHandler(async (req, res) => {
  try {
    const {
      couponCode,
      discountPercentage,
      platform = 'mofood',
      customerGroup = 'all',
      restaurantScope = 'selected',
      restaurantIds = [],
      minOrderValue = 0,
      maxLimit = null,
      showAtCheckout = true,
      startDate = null,
      endDate = null
    } = req.body || {};

    const normalizedCode = String(couponCode || '').trim().toUpperCase();
    const parsedDiscountPercentage = Number(discountPercentage);
    const parsedMinOrderValue = Math.max(0, Number(minOrderValue) || 0);
    const parsedMaxLimit = maxLimit === null || maxLimit === undefined || maxLimit === ''
      ? null
      : Math.max(0, Number(maxLimit) || 0);

    if (!normalizedCode) {
      return errorResponse(res, 400, 'Coupon code is required');
    }

    if (!Number.isFinite(parsedDiscountPercentage) || parsedDiscountPercentage <= 0 || parsedDiscountPercentage > 100) {
      return errorResponse(res, 400, 'Discount percentage must be between 1 and 100');
    }

    if (!['mofood', 'mogrocery'].includes(String(platform))) {
      return errorResponse(res, 400, 'platform must be "mofood" or "mogrocery"');
    }

    if (!['all', 'new', 'shared'].includes(customerGroup)) {
      return errorResponse(res, 400, 'customerGroup must be "all", "new", or "shared"');
    }

    if (!['all', 'selected'].includes(restaurantScope)) {
      return errorResponse(res, 400, 'restaurantScope must be "all" or "selected"');
    }

    const parsedStartDate = startDate ? new Date(startDate) : new Date();
    const parsedEndDate = endDate ? new Date(endDate) : null;
    if (Number.isNaN(parsedStartDate.getTime())) {
      return errorResponse(res, 400, 'Invalid startDate');
    }
    if (parsedEndDate && Number.isNaN(parsedEndDate.getTime())) {
      return errorResponse(res, 400, 'Invalid endDate');
    }
    if (parsedEndDate && parsedEndDate < parsedStartDate) {
      return errorResponse(res, 400, 'endDate must be after startDate');
    }

    const shouldCreateForBothPlatforms =
      String(customerGroup) === 'shared' &&
      String(platform) === 'mofood' &&
      String(restaurantScope) === 'all';

    const validIds = (Array.isArray(restaurantIds) ? restaurantIds : [])
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
      .map((id) => new mongoose.Types.ObjectId(String(id)));

    if (restaurantScope !== 'all' && validIds.length === 0) {
      return errorResponse(res, 400, 'At least one valid restaurant is required for selected scope');
    }

    let targetRestaurants = [];
    if (shouldCreateForBothPlatforms) {
      const [foodRestaurants, groceryStores] = await Promise.all([
        Restaurant.find({
          isActive: true,
          $or: [{ platform: 'mofood' }, { platform: { $exists: false } }]
        })
          .select('_id name restaurantId slug')
          .lean(),
        GroceryStore.find({ isActive: true })
          .select('_id name restaurantId slug')
          .lean(),
      ]);

      targetRestaurants = [
        ...foodRestaurants.map((restaurant) => ({
          offerRestaurantId: restaurant._id,
          restaurantName: restaurant.name || 'Unknown Restaurant',
          sourceRestaurantId: restaurant.restaurantId || String(restaurant._id),
        })),
        ...groceryStores.map((store) => ({
          offerRestaurantId: store._id,
          restaurantName: store.name || 'Unknown Store',
          sourceRestaurantId: store.restaurantId || String(store._id),
        })),
      ];
    } else if (String(platform) === 'mogrocery') {
      const groceryQuery = restaurantScope === 'all'
        ? { isActive: true }
        : { _id: { $in: validIds } };

      const groceryStores = await GroceryStore.find(groceryQuery)
        .select('_id name restaurantId')
        .lean();

      targetRestaurants = groceryStores.map((store) => ({
        offerRestaurantId: store._id,
        restaurantName: store.name || 'Unknown Store',
        sourceRestaurantId: store.restaurantId || String(store._id),
      }));
    } else {
      const foodQuery = restaurantScope === 'all'
        ? {
            isActive: true,
            $or: [{ platform: 'mofood' }, { platform: { $exists: false } }]
          }
        : {
            _id: { $in: validIds },
            $or: [{ platform: 'mofood' }, { platform: { $exists: false } }]
          };

      const foodRestaurants = await Restaurant.find(foodQuery)
        .select('_id name restaurantId')
        .lean();

      targetRestaurants = foodRestaurants.map((restaurant) => ({
        offerRestaurantId: restaurant._id,
        restaurantName: restaurant.name || 'Unknown Restaurant',
        sourceRestaurantId: restaurant.restaurantId || String(restaurant._id),
      }));
    }

    if (targetRestaurants.length === 0) {
      return errorResponse(res, 400, 'No eligible restaurants/stores found');
    }

    const created = [];
    const skipped = [];

    for (const restaurant of targetRestaurants) {
      const existingCoupon = await Offer.findOne({
        restaurant: restaurant.offerRestaurantId,
        status: { $in: ['active', 'paused', 'draft', 'expired'] },
        'items.couponCode': normalizedCode
      })
        .select('_id status')
        .lean();

      if (existingCoupon) {
        skipped.push({
          restaurantId: String(restaurant.sourceRestaurantId || restaurant.offerRestaurantId),
          restaurantName: restaurant.restaurantName || 'Unknown Restaurant',
          reason: 'Coupon code already exists for this restaurant'
        });
        continue;
      }

      const offer = await Offer.create({
        restaurant: restaurant.offerRestaurantId,
        goalId: 'increase-value',
        discountType: 'percentage',
        items: [
          {
            itemId: '__ALL_ITEMS__',
            itemName: 'All Items',
            originalPrice: 100,
            discountPercentage: parsedDiscountPercentage,
            discountedPrice: Math.max(0, 100 - parsedDiscountPercentage),
            couponCode: normalizedCode
          }
        ],
        customerGroup,
        offerPreference: 'all',
        offerDays: 'all',
        targetMealtime: 'all',
        minOrderValue: parsedMinOrderValue,
        maxLimit: parsedMaxLimit,
        showAtCheckout: showAtCheckout !== false,
        status: 'active',
        startDate: parsedStartDate,
        endDate: parsedEndDate
      });

      created.push({
        offerId: offer._id.toString(),
        restaurantId: String(restaurant.sourceRestaurantId || restaurant.offerRestaurantId),
        restaurantName: restaurant.restaurantName || 'Unknown Restaurant',
        couponCode: normalizedCode
      });
    }

    return successResponse(res, 201, 'Coupon offers created successfully', {
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped
    });
  } catch (error) {
    logger.error(`Error creating coupon offers: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to create coupon offers');
  }
});

/**
 * Update a coupon offer item and offer-level settings
 * PUT /api/admin/offers/:id
 */
export const updateOffer = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      dishId = null,
      platform,
      couponCode,
      discountPercentage,
      customerGroup,
      minOrderValue,
      maxLimit,
      showAtCheckout,
      startDate,
      endDate,
      status
    } = req.body || {};

    const offer = await Offer.findById(id);
    if (!offer) {
      return errorResponse(res, 404, 'Offer not found');
    }

    if (platform !== undefined) {
      if (!['mofood', 'mogrocery'].includes(String(platform))) {
        return errorResponse(res, 400, 'platform must be "mofood" or "mogrocery"');
      }

      const linkedRestaurant = await Restaurant.findById(offer.restaurant).select('platform').lean();
      const linkedGroceryStore = linkedRestaurant
        ? null
        : await GroceryStore.findById(offer.restaurant).select('_id').lean();
      const offerPlatform =
        linkedRestaurant?.platform === 'mogrocery' || linkedGroceryStore
          ? 'mogrocery'
          : 'mofood';
      if (offerPlatform !== String(platform)) {
        return errorResponse(res, 404, 'Offer not found for requested platform');
      }
    }

    const targetItemIndex = dishId
      ? offer.items.findIndex((item) => String(item.itemId) === String(dishId))
      : 0;
    if (targetItemIndex < 0) {
      return errorResponse(res, 400, 'Offer item not found for provided dishId');
    }

    if (customerGroup !== undefined) {
      if (!['all', 'new', 'shared'].includes(String(customerGroup))) {
        return errorResponse(res, 400, 'customerGroup must be "all", "new", or "shared"');
      }
      offer.customerGroup = String(customerGroup);
    }

    if (status !== undefined) {
      const normalizedStatus = String(status);
      if (!['draft', 'active', 'paused', 'expired', 'cancelled'].includes(normalizedStatus)) {
        return errorResponse(res, 400, 'Invalid status');
      }
      offer.status = normalizedStatus;
    }

    if (minOrderValue !== undefined) {
      offer.minOrderValue = Math.max(0, Number(minOrderValue) || 0);
    }

    if (maxLimit !== undefined) {
      offer.maxLimit =
        maxLimit === null || maxLimit === ''
          ? null
          : Math.max(0, Number(maxLimit) || 0);
    }

    if (showAtCheckout !== undefined) {
      offer.showAtCheckout = Boolean(showAtCheckout);
    }

    if (startDate !== undefined) {
      if (!startDate) {
        offer.startDate = new Date();
      } else {
        const parsedStartDate = new Date(startDate);
        if (Number.isNaN(parsedStartDate.getTime())) {
          return errorResponse(res, 400, 'Invalid startDate');
        }
        offer.startDate = parsedStartDate;
      }
    }

    if (endDate !== undefined) {
      if (!endDate) {
        offer.endDate = null;
      } else {
        const parsedEndDate = new Date(endDate);
        if (Number.isNaN(parsedEndDate.getTime())) {
          return errorResponse(res, 400, 'Invalid endDate');
        }
        offer.endDate = parsedEndDate;
      }
    }

    if (offer.endDate && offer.startDate && offer.endDate < offer.startDate) {
      return errorResponse(res, 400, 'endDate must be after startDate');
    }

    const targetItem = offer.items[targetItemIndex];

    if (couponCode !== undefined) {
      const normalizedCode = String(couponCode || '').trim().toUpperCase();
      if (!normalizedCode) {
        return errorResponse(res, 400, 'Coupon code is required');
      }

      const duplicateCoupon = await Offer.findOne({
        _id: { $ne: offer._id },
        restaurant: offer.restaurant,
        status: { $in: ['active', 'paused', 'draft', 'expired'] },
        'items.couponCode': normalizedCode
      })
        .select('_id')
        .lean();

      if (duplicateCoupon) {
        return errorResponse(res, 400, 'Coupon code already exists for this restaurant');
      }

      targetItem.couponCode = normalizedCode;
    }

    if (discountPercentage !== undefined) {
      const parsedDiscount = Number(discountPercentage);
      if (!Number.isFinite(parsedDiscount) || parsedDiscount <= 0 || parsedDiscount > 100) {
        return errorResponse(res, 400, 'Discount percentage must be between 1 and 100');
      }

      const originalPrice = Number(targetItem.originalPrice || 100);
      targetItem.discountPercentage = parsedDiscount;
      targetItem.discountedPrice = Math.max(
        0,
        Math.round((originalPrice - (originalPrice * parsedDiscount) / 100) * 100) / 100
      );
    }

    offer.markModified('items');
    await offer.save();

    if (showAtCheckout !== undefined && offer.customerGroup === 'shared') {
      const referenceCouponCode = String(targetItem?.couponCode || '').trim().toUpperCase();
      if (referenceCouponCode) {
        await Offer.updateMany(
          {
            _id: { $ne: offer._id },
            customerGroup: 'shared',
            'items.couponCode': referenceCouponCode
          },
          {
            $set: { showAtCheckout: Boolean(showAtCheckout) }
          }
        );
      }
    }

    return successResponse(res, 200, 'Offer updated successfully', {
      offer
    });
  } catch (error) {
    logger.error(`Error updating coupon offer: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update coupon offer');
  }
});

/**
 * Get Restaurant Analytics for POS
 * GET /api/admin/restaurant-analytics/:restaurantId
 */
export const getRestaurantAnalytics = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    logger.info(`Fetching restaurant analytics for: ${restaurantId}`);
    
    if (!restaurantId) {
      return errorResponse(res, 400, 'Restaurant ID is required');
    }
    
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      logger.warn(`Invalid restaurant ID format: ${restaurantId}`);
      return errorResponse(res, 400, 'Invalid restaurant ID format');
    }

    // Get restaurant details
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      logger.warn(`Restaurant not found: ${restaurantId}`);
      return errorResponse(res, 404, 'Restaurant not found');
    }
    
    logger.info(`Restaurant found: ${restaurant.name} (${restaurant.restaurantId})`);

    // Calculate date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Get order statistics - restaurantId can be _id or restaurantId field (both as String in Order model)
    // Match by both restaurant._id and restaurant.restaurantId
    const restaurantIdString = restaurantId.toString();
    const restaurantIdField = restaurant?.restaurantId || restaurantIdString;
    const restaurantObjectIdString = restaurant._id.toString();
    
    logger.info(`📊 Fetching order statistics for restaurant:`, {
      restaurantId: restaurantId,
      restaurantIdString: restaurantIdString,
      restaurantIdField: restaurantIdField,
      restaurantObjectIdString: restaurantObjectIdString,
      restaurantName: restaurant.name
    });
    
    // Build query to match restaurantId in multiple formats
    const orderMatchQuery = {
      $or: [
        { restaurantId: restaurantIdString },
        { restaurantId: restaurantIdField },
        { restaurantId: restaurantObjectIdString }
      ]
    };
    
    logger.info(`🔍 Order query:`, orderMatchQuery);
    
    const orderStats = await Order.aggregate([
      {
        $match: orderMatchQuery
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'delivered'] },
                { $ifNull: ['$pricing.total', 0] },
                0
              ]
            }
          }
        }
      }
    ]);

    logger.info(`📊 Order stats found:`, orderStats);

    const orderStatusMap = {};
    let totalRevenue = 0;
    orderStats.forEach(stat => {
      orderStatusMap[stat._id] = stat.count;
      if (stat._id === 'delivered') {
        totalRevenue += stat.totalRevenue || 0;
      }
    });

    const totalOrders = (orderStatusMap.delivered || 0) + (orderStatusMap.cancelled || 0) + 
                       (orderStatusMap.pending || 0) + (orderStatusMap.confirmed || 0) +
                       (orderStatusMap.preparing || 0) + (orderStatusMap.ready || 0) +
                       (orderStatusMap.out_for_delivery || 0);
    const completedOrders = orderStatusMap.delivered || 0;
    const cancelledOrders = orderStatusMap.cancelled || 0;
    
    logger.info(`📊 Calculated order statistics:`, {
      totalOrders,
      completedOrders,
      cancelledOrders,
      orderStatusMap
    });

    // Get monthly orders and revenue
    const monthlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField }
          ],
          status: 'delivered',
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$pricing.total', 0] } }
        }
      }
    ]);

    const monthlyOrders = monthlyStats[0]?.count || 0;
    const monthlyRevenue = monthlyStats[0]?.revenue || 0;

    // Get yearly orders and revenue
    const yearlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField }
          ],
          status: 'delivered',
          createdAt: { $gte: startOfYear }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$pricing.total', 0] } }
        }
      }
    ]);

    const yearlyOrders = yearlyStats[0]?.count || 0;
    const yearlyRevenue = yearlyStats[0]?.revenue || 0;

    // Get commission and earnings data from OrderSettlement (more accurate)
    // Match settlements by restaurantId (ObjectId in OrderSettlement)
    const restaurantIdForSettlement = restaurant._id instanceof mongoose.Types.ObjectId 
      ? restaurant._id 
      : new mongoose.Types.ObjectId(restaurant._id);
    
    // Get all settlements for this restaurant
    const allSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement
    }).lean();
    
    // Calculate totals from settlements
    let totalCommission = 0;
    let totalRestaurantEarning = 0;
    let totalFoodPrice = 0;
    
    allSettlements.forEach(s => {
      totalCommission += s.restaurantEarning?.commission || 0;
      totalRestaurantEarning += s.restaurantEarning?.netEarning || 0;
      totalFoodPrice += s.restaurantEarning?.foodPrice || 0;
    });
    
    totalCommission = Math.round(totalCommission * 100) / 100;
    totalRestaurantEarning = Math.round(totalRestaurantEarning * 100) / 100;
    totalFoodPrice = Math.round(totalFoodPrice * 100) / 100;
    
    // Get monthly settlements
    const monthlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfMonth }
    }).lean();
    
    let monthlyCommission = 0;
    let monthlyRestaurantEarning = 0;
    monthlySettlements.forEach(s => {
      monthlyCommission += s.restaurantEarning?.commission || 0;
      monthlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });
    
    monthlyCommission = Math.round(monthlyCommission * 100) / 100;
    monthlyRestaurantEarning = Math.round(monthlyRestaurantEarning * 100) / 100;
    const monthlyProfit = monthlyRestaurantEarning; // Restaurant profit = net earning

    // Get yearly settlements
    const yearlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfYear }
    }).lean();
    
    let yearlyCommission = 0;
    let yearlyRestaurantEarning = 0;
    yearlySettlements.forEach(s => {
      yearlyCommission += s.restaurantEarning?.commission || 0;
      yearlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });
    
    yearlyCommission = Math.round(yearlyCommission * 100) / 100;
    yearlyRestaurantEarning = Math.round(yearlyRestaurantEarning * 100) / 100;
    const yearlyProfit = yearlyRestaurantEarning; // Restaurant profit = net earning

    // Get average monthly profit (last 12 months)
    const last12MonthsStart = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const last12MonthsSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: last12MonthsStart }
    }).lean();
    
    // Group by month
    const monthlyEarningsMap = new Map();
    last12MonthsSettlements.forEach(s => {
      const monthKey = `${new Date(s.createdAt).getFullYear()}-${new Date(s.createdAt).getMonth()}`;
      const current = monthlyEarningsMap.get(monthKey) || 0;
      monthlyEarningsMap.set(monthKey, current + (s.restaurantEarning?.netEarning || 0));
    });
    
    const avgMonthlyProfit = monthlyEarningsMap.size > 0
      ? Array.from(monthlyEarningsMap.values()).reduce((sum, val) => sum + val, 0) / monthlyEarningsMap.size
      : 0;

    // Get commission percentage from RestaurantCommission
    const RestaurantCommission = (await import('../models/RestaurantCommission.js')).default;
    
    // Use restaurant._id directly - ensure it's an ObjectId
    const restaurantIdForQuery = restaurant._id instanceof mongoose.Types.ObjectId 
      ? restaurant._id 
      : new mongoose.Types.ObjectId(restaurant._id);
    
    logger.info(`🔍 Looking for commission config:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForQuery.toString(),
      restaurantName: restaurant.name,
      restaurantIdString: restaurant.restaurantId
    });
    
    // Try using the static method first
    let commissionConfig = await RestaurantCommission.getCommissionForRestaurant(restaurantIdForQuery);
    
    if (commissionConfig) {
      // Convert to plain object if needed
      commissionConfig = commissionConfig.toObject ? commissionConfig.toObject() : commissionConfig;
      logger.info(`✅ Found commission using static method`);
    }
    
    // If not found, try direct query
    if (!commissionConfig) {
      logger.info(`⚠️ Static method didn't find commission, trying direct query`);
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery,
        status: true
      });
      
      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject ? commissionConfig.toObject() : commissionConfig;
      }
    }
    
    // If still not found, try without status filter
    if (!commissionConfig) {
      logger.info(`⚠️ Trying without status filter`);
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery
      });
      
      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject ? commissionConfig.toObject() : commissionConfig;
      }
    }
    
    // Also try by restaurantId string field
    if (!commissionConfig && restaurant?.restaurantId) {
      logger.info(`🔄 Trying by restaurantId string: ${restaurant.restaurantId}`);
      commissionConfig = await RestaurantCommission.findOne({
        restaurantId: restaurant.restaurantId
      });
      
      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject ? commissionConfig.toObject() : commissionConfig;
      }
    }
    
    // Final debug: List all commissions to see what's in DB
    if (!commissionConfig) {
      const allCommissions = await RestaurantCommission.find({}).lean();
      logger.warn(`❌ No commission found. Total commissions in DB: ${allCommissions.length}`);
      logger.info(`📋 All commissions:`, allCommissions.map(c => ({
        _id: c._id,
        restaurant: c.restaurant?.toString ? c.restaurant.toString() : String(c.restaurant),
        restaurantId: c.restaurantId,
        restaurantName: c.restaurantName,
        status: c.status,
        defaultCommission: c.defaultCommission
      })));
      
      // Check if restaurant ObjectId matches any commission
      const matching = allCommissions.filter(c => {
        const cRestaurantId = c.restaurant?.toString ? c.restaurant.toString() : String(c.restaurant);
        return cRestaurantId === restaurantIdForQuery.toString();
      });
      logger.info(`🔍 Matching commissions: ${matching.length}`, matching);
    }

    let commissionPercentage = 0;
    if (commissionConfig) {
      logger.info(`✅ Commission config found for restaurant ${restaurantId}`);
      logger.info(`Commission config details:`, {
        _id: commissionConfig._id,
        restaurant: commissionConfig.restaurant?.toString ? commissionConfig.restaurant.toString() : String(commissionConfig.restaurant),
        restaurantId: commissionConfig.restaurantId,
        restaurantName: commissionConfig.restaurantName,
        status: commissionConfig.status,
        hasDefaultCommission: !!commissionConfig.defaultCommission,
        defaultCommissionType: commissionConfig.defaultCommission?.type,
        defaultCommissionValue: commissionConfig.defaultCommission?.value
      });
      
      if (commissionConfig.defaultCommission) {
        // Get default commission value - if type is percentage, show the percentage value
        logger.info(`📊 Processing defaultCommission:`, {
          type: commissionConfig.defaultCommission.type,
          value: commissionConfig.defaultCommission.value,
          valueType: typeof commissionConfig.defaultCommission.value
        });
        
        if (commissionConfig.defaultCommission.type === 'percentage') {
          const rawValue = commissionConfig.defaultCommission.value;
          commissionPercentage = typeof rawValue === 'number' 
            ? rawValue 
            : parseFloat(rawValue) || 0;
          logger.info(`✅ Found commission percentage: ${commissionPercentage}% for restaurant ${restaurantId} (raw value: ${rawValue})`);
        } else if (commissionConfig.defaultCommission.type === 'amount') {
          // For amount type, we can't show a percentage, so keep it as 0
          commissionPercentage = 0;
          logger.info(`⚠️ Commission type is 'amount', not 'percentage' for restaurant ${restaurantId}`);
        }
      } else {
        logger.warn(`⚠️ Commission config found but no defaultCommission for restaurant ${restaurantId}`);
      }
    } else {
      logger.warn(`❌ No commission config found for restaurant ${restaurantId} (restaurant._id: ${restaurantIdForQuery.toString()})`);
      logger.warn(`⚠️ This restaurant may not have a commission configuration set up.`);
      logger.warn(`💡 To set up commission, go to Restaurant Commission page and add commission for this restaurant.`);
    }
    
    // Log the final commission percentage being returned
    logger.info(`📊 Final commission percentage being returned: ${commissionPercentage}%`);
    logger.info(`📤 Sending response with commissionPercentage: ${commissionPercentage}`);

    // Get ratings from FeedbackExperience (restaurantId is ObjectId in FeedbackExperience)
    const FeedbackExperience = (await import('../models/FeedbackExperience.js')).default;
    
    const restaurantIdForRating = restaurant._id instanceof mongoose.Types.ObjectId 
      ? restaurant._id 
      : new mongoose.Types.ObjectId(restaurant._id);
    
    logger.info(`⭐ Fetching ratings for restaurant:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForRating.toString()
    });
    
    const ratingStats = await FeedbackExperience.aggregate([
      {
        $match: {
          restaurantId: restaurantIdForRating,
          rating: { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 }
        }
      }
    ]);

    logger.info(`⭐ Rating stats found:`, ratingStats);

    const averageRating = ratingStats[0]?.averageRating || 0;
    const totalRatings = ratingStats[0]?.totalRatings || 0;
    
    logger.info(`⭐ Calculated ratings:`, {
      averageRating,
      totalRatings
    });

    // Get unique customers
    const customerStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField }
          ],
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: '$userId',
          orderCount: { $sum: 1 }
        }
      }
    ]);

    const totalCustomers = customerStats.length;
    const repeatCustomers = customerStats.filter(c => c.orderCount > 1).length;

    // Calculate average order value
    const averageOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

    // Calculate rates
    const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;
    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

    // Calculate average yearly profit (if restaurant has been active for multiple years)
    const restaurantCreatedAt = restaurant.createdAt || new Date();
    const yearsActive = Math.max(1, (now - restaurantCreatedAt) / (365 * 24 * 60 * 60 * 1000));
    const averageYearlyProfit = yearsActive > 0 ? yearlyRestaurantEarning / yearsActive : yearlyRestaurantEarning;

    return successResponse(res, 200, 'Restaurant analytics retrieved successfully', {
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        restaurantId: restaurant.restaurantId,
        isActive: restaurant.isActive,
        createdAt: restaurant.createdAt
      },
      analytics: {
        totalOrders: Number(totalOrders) || 0,
        cancelledOrders: Number(cancelledOrders) || 0,
        completedOrders: Number(completedOrders) || 0,
        averageRating: averageRating ? parseFloat(averageRating.toFixed(1)) : 0,
        totalRatings: Number(totalRatings) || 0,
        commissionPercentage: Number(commissionPercentage) || 0,
        monthlyProfit: parseFloat(monthlyRestaurantEarning.toFixed(2)),
        yearlyProfit: parseFloat(yearlyRestaurantEarning.toFixed(2)),
        averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalCommission: parseFloat(totalCommission.toFixed(2)),
        restaurantEarning: parseFloat(totalRestaurantEarning.toFixed(2)),
        monthlyOrders,
        yearlyOrders,
        averageMonthlyProfit: parseFloat(avgMonthlyProfit.toFixed(2)),
        averageYearlyProfit: parseFloat(averageYearlyProfit.toFixed(2)),
        status: restaurant.isActive ? 'active' : 'inactive',
        joinDate: restaurant.createdAt,
        totalCustomers,
        repeatCustomers,
        cancellationRate: parseFloat(cancellationRate.toFixed(2)),
        completionRate: parseFloat(completionRate.toFixed(2))
      }
    });
  } catch (error) {
    logger.error(`Error fetching restaurant analytics: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch restaurant analytics');
  }
});

/**
 * Get Customer Wallet Report
 * GET /api/admin/customer-wallet-report
 * Query params: fromDate, toDate, all (Credit/Debit), customer, search
 */
export const getCustomerWalletReport = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching customer wallet report...');
    const { 
      fromDate,
      toDate,
      all,
      customer,
      search
    } = req.query;
    
    console.log('📋 Query params:', { fromDate, toDate, all, customer, search });

    const UserWallet = (await import('../../user/models/UserWallet.js')).default;
    const User = (await import('../../auth/models/User.js')).default;

    // Build date filter
    let dateFilter = {};
    if (fromDate || toDate) {
      dateFilter['transactions.createdAt'] = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        dateFilter['transactions.createdAt'].$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        dateFilter['transactions.createdAt'].$lte = endDate;
      }
    }

    // Get all wallets with transactions
    const wallets = await UserWallet.find({
      ...dateFilter,
      'transactions.0': { $exists: true } // Only wallets with transactions
    })
      .populate('userId', 'name email phone')
      .lean();

    // Flatten transactions with user info
    let allTransactions = [];
    wallets.forEach(wallet => {
      if (!wallet.userId) return;
      
      // Sort transactions by date (oldest first for balance calculation)
      const sortedTransactions = [...wallet.transactions].sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      
      let runningBalance = 0;
      
      sortedTransactions.forEach((transaction) => {
        // Update running balance if transaction is completed (before date filter)
        let balance = runningBalance;
        if (transaction.status === 'Completed') {
          if (transaction.type === 'addition' || transaction.type === 'refund') {
            runningBalance += transaction.amount;
            balance = runningBalance;
          } else if (transaction.type === 'deduction') {
            runningBalance -= transaction.amount;
            balance = runningBalance;
          }
        }
        
        // Apply date filter if provided
        if (fromDate || toDate) {
          const transDate = new Date(transaction.createdAt);
          if (fromDate && transDate < new Date(fromDate)) return;
          if (toDate) {
            const toDateObj = new Date(toDate);
            toDateObj.setHours(23, 59, 59, 999);
            if (transDate > toDateObj) return;
          }
        }

        // Map transaction type to frontend format
        let transactionType = 'CashBack';
        if (transaction.type === 'addition') {
          if (transaction.description?.includes('Admin') || transaction.description?.includes('admin')) {
            transactionType = 'Add Fund By Admin';
          } else {
            transactionType = 'Add Fund';
          }
        } else if (transaction.type === 'deduction') {
          transactionType = 'Order Payment';
        } else if (transaction.type === 'refund') {
          transactionType = 'Refund';
        }

        // Get reference
        let reference = 'N/A';
        if (transaction.orderId) {
          reference = transaction.orderId.toString();
        } else if (transaction.paymentGateway) {
          reference = transaction.paymentGateway;
        } else if (transaction.description) {
          reference = transaction.description;
        }

        allTransactions.push({
          _id: transaction._id,
          transactionId: transaction._id.toString(),
          customer: wallet.userId.name || 'Unknown',
          customerId: wallet.userId._id.toString(),
          credit: transaction.type === 'addition' || transaction.type === 'refund' ? transaction.amount : 0,
          debit: transaction.type === 'deduction' ? transaction.amount : 0,
          balance: balance,
          transactionType: transactionType,
          reference: reference,
          createdAt: transaction.createdAt,
          status: transaction.status,
          type: transaction.type
        });
      });
    });

    // Filter by transaction type (Credit/Debit)
    if (all && all !== 'All') {
      if (all === 'Credit') {
        allTransactions = allTransactions.filter(t => t.credit > 0);
      } else if (all === 'Debit') {
        allTransactions = allTransactions.filter(t => t.debit > 0);
      }
    }

    // Filter by customer
    if (customer && customer !== 'Select Customer') {
      allTransactions = allTransactions.filter(t => 
        t.customer.toLowerCase().includes(customer.toLowerCase())
      );
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allTransactions = allTransactions.filter(t =>
        t.transactionId.toLowerCase().includes(searchLower) ||
        t.customer.toLowerCase().includes(searchLower) ||
        t.reference.toLowerCase().includes(searchLower)
      );
    }

    // Sort by date (newest first)
    allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Format currency
    const formatCurrency = (amount) => {
      return `₹${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Format date
    const formatDate = (date) => {
      const d = new Date(date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
    };

    // Transform transactions for frontend
    const transformedTransactions = allTransactions.map((transaction, index) => ({
      sl: index + 1,
      transactionId: transaction.transactionId,
      customer: transaction.customer,
      credit: formatCurrency(transaction.credit),
      debit: formatCurrency(transaction.debit),
      balance: formatCurrency(transaction.balance),
      transactionType: transaction.transactionType,
      reference: transaction.reference,
      createdAt: formatDate(transaction.createdAt)
    }));

    // Calculate summary statistics
    const totalDebit = allTransactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = allTransactions.reduce((sum, t) => sum + t.credit, 0);
    const totalBalance = totalCredit - totalDebit;

    // Get unique customers for dropdown
    const uniqueCustomers = [...new Set(allTransactions.map(t => t.customer))].sort();

    return successResponse(res, 200, 'Customer wallet report retrieved successfully', {
      transactions: transformedTransactions,
      stats: {
        debit: formatCurrency(totalDebit),
        credit: formatCurrency(totalCredit),
        balance: formatCurrency(totalBalance)
      },
      customers: uniqueCustomers,
      pagination: {
        page: 1,
        limit: 10000,
        total: transformedTransactions.length,
        pages: 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching customer wallet report:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch customer wallet report');
  }
});


