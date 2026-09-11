import mongoose from 'mongoose';
import Menu from '../models/Menu.js';
import Zone from '../../admin/models/Zone.js';
import MofoodProductSectionItem from '../../heroBanner/models/MofoodProductSectionItem.js';
import { parseOfferWindow } from '../../heroBanner/controllers/heroBannerController.js';
import { resolveRestaurantZone } from '../../admin/controllers/categoryController.js';
import { flattenMenuItems, matchesId } from './bestItemsController.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Today's Offer, managed by the owning vendor (requirement 7).
 *
 * Entries go into the same product-sections collection the admin panel
 * manages, under the same section name, so vendor and admin offers form one
 * section: admin sees and can reorder or remove vendor entries, and customers
 * see both. A vendor entry is pinned to the restaurant's delivery zone, so it is
 * only shown to customers the restaurant can actually deliver to.
 */
export const TODAYS_OFFER_SECTION = "Today's Offer";
const DEFAULT_SECTION_ORDER = 1; // Matches the admin panel's Today's Offer preset.
const MAX_ITEMS_PER_RESTAURANT = 10;

const ownFilter = (restaurant) => ({
  restaurantId: restaurant._id,
  sectionName: TODAYS_OFFER_SECTION,
});

// The public endpoint groups entries by section order and name, so vendor
// entries must reuse whatever order the section already has or they would
// appear as a second "Today's Offer" block.
const sectionOrderInUse = async () => {
  const existing = await MofoodProductSectionItem.findOne({
    sectionName: TODAYS_OFFER_SECTION,
    $or: [{ platform: 'mofood' }, { platform: { $exists: false } }],
  })
    .select('sectionOrder')
    .lean();
  return existing ? Number(existing.sectionOrder || 0) : DEFAULT_SECTION_ORDER;
};

const restaurantZoneId = async (restaurant) => {
  const zones = await Zone.find({
    isActive: true,
    $or: [{ platform: 'mofood' }, { platform: { $exists: false } }],
  }).lean();
  return resolveRestaurantZone(restaurant, zones)?._id || null;
};

const readWindow = (body, current = {}) => {
  // A field left out keeps its current value; an empty value clears it.
  const startsAt = Object.prototype.hasOwnProperty.call(body, 'startsAt') ? body.startsAt : current.startsAt;
  const endsAt = Object.prototype.hasOwnProperty.call(body, 'endsAt') ? body.endsAt : current.endsAt;
  const window = parseOfferWindow(startsAt, endsAt);
  if (window.error) return window;
  if (window.endsAt && window.endsAt <= new Date()) {
    return { error: 'The end time has already passed' };
  }
  return window;
};

/**
 * GET /api/restaurant/todays-offer
 */
export const listTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const items = await MofoodProductSectionItem.find(ownFilter(req.restaurant))
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return successResponse(res, 200, "Today's Offer retrieved successfully", { items });
  } catch (error) {
    console.error("Error listing Today's Offer:", error);
    return errorResponse(res, 500, "Failed to fetch Today's Offer");
  }
});

/**
 * POST /api/restaurant/todays-offer   Body: { menuItemId, startsAt?, endsAt? }
 */
export const addTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const body = req.body || {};
    const menuItemId = String(body.menuItemId || '').trim();
    if (!menuItemId) {
      return errorResponse(res, 400, 'menuItemId is required');
    }

    const window = readWindow(body);
    if (window.error) {
      return errorResponse(res, 400, window.error);
    }

    const count = await MofoodProductSectionItem.countDocuments(ownFilter(req.restaurant));
    if (count >= MAX_ITEMS_PER_RESTAURANT) {
      return errorResponse(res, 400, `You can have up to ${MAX_ITEMS_PER_RESTAURANT} dishes in Today's Offer`);
    }

    const menuDoc = await Menu.findOne({ restaurant: req.restaurant._id, isActive: true }).select('sections').lean();
    if (!menuDoc) {
      return errorResponse(res, 404, 'Restaurant menu not found');
    }

    // Only dishes on this restaurant's own menu may be offered.
    const matched = flattenMenuItems(menuDoc).find((item) => matchesId(item, menuItemId));
    if (!matched) {
      return errorResponse(res, 404, 'Dish not found on your menu');
    }

    const duplicate = await MofoodProductSectionItem.findOne({ ...ownFilter(req.restaurant), menuItemId }).lean();
    if (duplicate) {
      return errorResponse(res, 400, "This dish is already in Today's Offer");
    }

    const [zoneId, sectionOrder] = await Promise.all([restaurantZoneId(req.restaurant), sectionOrderInUse()]);

    // Appended after everything already in the section for that zone, admin
    // entries included; admin decides the overall order.
    const last = await MofoodProductSectionItem.findOne({ sectionName: TODAYS_OFFER_SECTION, zoneId })
      .sort({ order: -1 })
      .select('order')
      .lean();

    const created = await MofoodProductSectionItem.create({
      platform: 'mofood',
      sectionName: TODAYS_OFFER_SECTION,
      sectionOrder,
      zoneId,
      restaurantId: req.restaurant._id,
      menuItemId,
      menuItemName: String(matched?.name || '').trim(),
      menuItemImage:
        String(matched?.image || '').trim() ||
        (Array.isArray(matched?.images) ? String(matched.images[0] || '').trim() : ''),
      menuItemPrice: Number(matched?.price || 0),
      menuItemOriginalPrice: Number(matched?.originalPrice || matched?.price || 0),
      order: last ? Number(last.order || 0) + 1 : 0,
      isActive: true,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      addedByRole: 'vendor',
    });

    return successResponse(res, 201, "Added to Today's Offer", { item: created });
  } catch (error) {
    console.error("Error adding to Today's Offer:", error);
    return errorResponse(res, 500, "Failed to add to Today's Offer");
  }
});

/**
 * PATCH /api/restaurant/todays-offer/:id   Body: { startsAt?, endsAt? }
 */
export const updateTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid id');
    }

    // Scoped to the caller's restaurant so a vendor cannot edit another's entry.
    const item = await MofoodProductSectionItem.findOne({ _id: id, ...ownFilter(req.restaurant) });
    if (!item) {
      return errorResponse(res, 404, "Today's Offer entry not found");
    }

    const window = readWindow(req.body || {}, { startsAt: item.startsAt, endsAt: item.endsAt });
    if (window.error) {
      return errorResponse(res, 400, window.error);
    }

    item.startsAt = window.startsAt;
    item.endsAt = window.endsAt;
    await item.save();

    return successResponse(res, 200, 'Offer times updated', { item: item.toObject() });
  } catch (error) {
    console.error("Error updating Today's Offer:", error);
    return errorResponse(res, 500, "Failed to update Today's Offer");
  }
});

/**
 * DELETE /api/restaurant/todays-offer/:id
 */
export const removeTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid id');
    }

    const deleted = await MofoodProductSectionItem.findOneAndDelete({ _id: id, ...ownFilter(req.restaurant) }).lean();
    if (!deleted) {
      return errorResponse(res, 404, "Today's Offer entry not found");
    }

    return successResponse(res, 200, "Removed from Today's Offer", { id });
  } catch (error) {
    console.error("Error removing from Today's Offer:", error);
    return errorResponse(res, 500, "Failed to remove from Today's Offer");
  }
});

/**
 * PATCH /api/restaurant/todays-offer/reorder   Body: { ids: [...] }
 *
 * The section also holds admin entries and other restaurants' dishes, so a
 * vendor reorders only among its own: its entries swap between the positions
 * they already occupy, leaving everyone else's where they were.
 */
export const reorderTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'ids must be a non-empty array');
    }
    if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id)) || new Set(ids.map(String)).size !== ids.length) {
      return errorResponse(res, 400, 'ids contains an invalid or repeated value');
    }

    const owned = await MofoodProductSectionItem.find({ _id: { $in: ids }, ...ownFilter(req.restaurant) })
      .select('_id order')
      .lean();

    // Reject the whole request rather than partially applying an order that
    // includes entries the caller does not own.
    if (owned.length !== ids.length) {
      return errorResponse(res, 400, 'One or more entries do not belong to your restaurant');
    }

    const slots = owned.map((entry) => Number(entry.order || 0)).sort((a, b) => a - b);
    await MofoodProductSectionItem.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order: slots[index] } } },
      })),
    );

    return successResponse(res, 200, 'Order updated successfully', { ids });
  } catch (error) {
    console.error("Error reordering Today's Offer:", error);
    return errorResponse(res, 500, 'Failed to reorder');
  }
});
