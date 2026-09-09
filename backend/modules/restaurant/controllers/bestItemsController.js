import mongoose from 'mongoose';
import Menu from '../models/Menu.js';
import MofoodProductSectionItem from '../../heroBanner/models/MofoodProductSectionItem.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * "Best of this restaurant" pins, manageable by the owning vendor.
 *
 * Storage is the same MofoodProductSectionItem collection the admin panel
 * manages, under a fixed section name, so a pin made by a vendor and one made
 * by an admin are the same record and neither view hides the other's work.
 */
export const BEST_ITEMS_SECTION = 'Best of this Restaurant';

/** Menu items live in sections.items and sections.subsections.items. */
const flattenMenuItems = (menuDoc) => {
  const out = [];
  for (const section of menuDoc?.sections || []) {
    for (const item of section?.items || []) out.push(item);
    for (const sub of section?.subsections || []) {
      for (const item of sub?.items || []) out.push(item);
    }
  }
  return out;
};

const matchesId = (item, wanted) => {
  const target = String(wanted).trim();
  return String(item?._id || '') === target || String(item?.id || '') === target;
};

/**
 * GET /api/restaurant/best-items
 */
export const listBestItems = asyncHandler(async (req, res) => {
  try {
    const items = await MofoodProductSectionItem.find({
      restaurantId: req.restaurant._id,
      sectionName: BEST_ITEMS_SECTION,
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return successResponse(res, 200, 'Best items retrieved successfully', { items });
  } catch (error) {
    console.error('Error listing best items:', error);
    return errorResponse(res, 500, 'Failed to fetch best items');
  }
});

/**
 * POST /api/restaurant/best-items   Body: { menuItemId }
 */
export const pinBestItem = asyncHandler(async (req, res) => {
  try {
    const { menuItemId } = req.body || {};
    if (!menuItemId) {
      return errorResponse(res, 400, 'menuItemId is required');
    }

    const menuDoc = await Menu.findOne({ restaurant: req.restaurant._id, isActive: true })
      .select('sections')
      .lean();
    if (!menuDoc) {
      return errorResponse(res, 404, 'Restaurant menu not found');
    }

    // Only items on this restaurant's own menu may be pinned.
    const matched = flattenMenuItems(menuDoc).find((item) => matchesId(item, menuItemId));
    if (!matched) {
      return errorResponse(res, 404, 'Menu item not found on your menu');
    }

    const duplicate = await MofoodProductSectionItem.findOne({
      restaurantId: req.restaurant._id,
      sectionName: BEST_ITEMS_SECTION,
      menuItemId: String(menuItemId).trim(),
    }).lean();
    if (duplicate) {
      return errorResponse(res, 400, 'This item is already pinned');
    }

    const last = await MofoodProductSectionItem.findOne({
      restaurantId: req.restaurant._id,
      sectionName: BEST_ITEMS_SECTION,
    })
      .sort({ order: -1 })
      .select('order')
      .lean();

    const created = await MofoodProductSectionItem.create({
      platform: 'mofood',
      sectionName: BEST_ITEMS_SECTION,
      sectionOrder: 0,
      restaurantId: req.restaurant._id,
      menuItemId: String(menuItemId).trim(),
      menuItemName: String(matched?.name || '').trim(),
      menuItemImage:
        String(matched?.image || '').trim() ||
        (Array.isArray(matched?.images) ? String(matched.images[0] || '').trim() : ''),
      menuItemPrice: Number(matched?.price || 0),
      menuItemOriginalPrice: Number(matched?.originalPrice || matched?.price || 0),
      order: last ? Number(last.order || 0) + 1 : 0,
      isActive: true,
      addedByRole: 'vendor',
    });

    return successResponse(res, 201, 'Item pinned successfully', { item: created });
  } catch (error) {
    console.error('Error pinning best item:', error);
    return errorResponse(res, 500, 'Failed to pin item');
  }
});

/**
 * DELETE /api/restaurant/best-items/:id
 */
export const unpinBestItem = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid id');
    }

    // Scoped to the caller's restaurant so a vendor cannot unpin someone else's.
    const deleted = await MofoodProductSectionItem.findOneAndDelete({
      _id: id,
      restaurantId: req.restaurant._id,
      sectionName: BEST_ITEMS_SECTION,
    }).lean();

    if (!deleted) {
      return errorResponse(res, 404, 'Pinned item not found');
    }

    return successResponse(res, 200, 'Item unpinned successfully', { id });
  } catch (error) {
    console.error('Error unpinning best item:', error);
    return errorResponse(res, 500, 'Failed to unpin item');
  }
});

/**
 * PATCH /api/restaurant/best-items/reorder   Body: { ids: [...] }
 * Positions follow the order of the supplied array.
 */
export const reorderBestItems = asyncHandler(async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'ids must be a non-empty array');
    }
    if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return errorResponse(res, 400, 'ids contains an invalid value');
    }

    const owned = await MofoodProductSectionItem.find({
      _id: { $in: ids },
      restaurantId: req.restaurant._id,
      sectionName: BEST_ITEMS_SECTION,
    })
      .select('_id')
      .lean();

    // Reject the whole request rather than partially applying an order that
    // includes items the caller does not own.
    if (owned.length !== ids.length) {
      return errorResponse(res, 400, 'One or more items do not belong to your restaurant');
    }

    await MofoodProductSectionItem.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
      })),
    );

    return successResponse(res, 200, 'Order updated successfully', { ids });
  } catch (error) {
    console.error('Error reordering best items:', error);
    return errorResponse(res, 500, 'Failed to reorder items');
  }
});

/**
 * GET /api/restaurant/:restaurantId/best-items   (public)
 * Powers the "Best of this restaurant" block on a restaurant profile.
 */
export const getPublicBestItems = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return errorResponse(res, 400, 'Invalid restaurant id');
    }

    const now = new Date();
    const items = await MofoodProductSectionItem.find({
      restaurantId,
      sectionName: BEST_ITEMS_SECTION,
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return successResponse(res, 200, 'Best items retrieved successfully', {
      items: items.map((item) => ({
        _id: item._id,
        menuItemId: item.menuItemId,
        name: item.menuItemName,
        image: item.menuItemImage,
        price: item.menuItemPrice,
        originalPrice: item.menuItemOriginalPrice,
        order: item.order,
      })),
    });
  } catch (error) {
    console.error('Error fetching public best items:', error);
    return errorResponse(res, 500, 'Failed to fetch best items');
  }
});
