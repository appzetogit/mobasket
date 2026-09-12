import mongoose from 'mongoose';
import GroceryProduct from '../models/GroceryProduct.js';
import MofoodProductSectionItem from '../../heroBanner/models/MofoodProductSectionItem.js';
import { parseOfferWindow } from '../../heroBanner/controllers/heroBannerController.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

/**
 * Today's Offer for a grocery store (requirement 7), the store's own side.
 *
 * The same section the admin panel manages and the MoGrocery home page reads,
 * so a store's offers and admin's sit together in one section. Entries are
 * pinned to the store's delivery zone, so only customers it serves see them.
 */
export const TODAYS_OFFER_SECTION = "Today's Offer";
const DEFAULT_SECTION_ORDER = 4; // Matches the admin panel's MoGrocery preset.
const MAX_ITEMS_PER_STORE = 10;

const ownFilter = (store) => ({
  storeId: store._id,
  sectionName: TODAYS_OFFER_SECTION,
  platform: 'mogrocery',
});

// The public endpoint groups by section order and name, so entries must reuse
// the order the section already has or they would form a second block.
const sectionOrderInUse = async () => {
  const existing = await MofoodProductSectionItem.findOne({
    sectionName: TODAYS_OFFER_SECTION,
    platform: 'mogrocery',
  })
    .select('sectionOrder')
    .lean();
  return existing ? Number(existing.sectionOrder || 0) : DEFAULT_SECTION_ORDER;
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

/** GET /api/grocery/store/todays-offer */
export const listStoreTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const items = await MofoodProductSectionItem.find(ownFilter(req.store))
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return successResponse(res, 200, "Today's Offer retrieved successfully", { items });
  } catch (error) {
    console.error("Error listing store Today's Offer:", error);
    return errorResponse(res, 500, "Failed to fetch Today's Offer");
  }
});

/** POST /api/grocery/store/todays-offer   Body: { productId, startsAt?, endsAt? } */
export const addStoreTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const body = req.body || {};
    const productId = String(body.productId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return errorResponse(res, 400, 'A valid productId is required');
    }

    const window = readWindow(body);
    if (window.error) {
      return errorResponse(res, 400, window.error);
    }

    const count = await MofoodProductSectionItem.countDocuments(ownFilter(req.store));
    if (count >= MAX_ITEMS_PER_STORE) {
      return errorResponse(res, 400, `You can have up to ${MAX_ITEMS_PER_STORE} products in Today's Offer`);
    }

    // Only the store's own products may be offered.
    const product = await GroceryProduct.findOne({ _id: productId, storeId: req.store._id })
      .select('name images mrp sellingPrice')
      .lean();
    if (!product) {
      return errorResponse(res, 404, 'Product not found in your store');
    }

    const duplicate = await MofoodProductSectionItem.findOne({ ...ownFilter(req.store), productId }).lean();
    if (duplicate) {
      return errorResponse(res, 400, "This product is already in Today's Offer");
    }

    const zoneId = req.store.zoneId || null;
    const sectionOrder = await sectionOrderInUse();
    const last = await MofoodProductSectionItem.findOne({
      sectionName: TODAYS_OFFER_SECTION,
      platform: 'mogrocery',
      zoneId,
    })
      .sort({ order: -1 })
      .select('order')
      .lean();

    const created = await MofoodProductSectionItem.create({
      platform: 'mogrocery',
      sectionName: TODAYS_OFFER_SECTION,
      sectionOrder,
      zoneId,
      storeId: req.store._id,
      productId: product._id,
      menuItemId: '',
      menuItemName: String(product.name || '').trim(),
      menuItemImage: Array.isArray(product.images) ? String(product.images[0] || '').trim() : '',
      menuItemPrice: Number(product.sellingPrice || 0),
      menuItemOriginalPrice: Number(product.mrp || product.sellingPrice || 0),
      order: last ? Number(last.order || 0) + 1 : 0,
      isActive: true,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      addedByRole: 'vendor',
    });

    return successResponse(res, 201, "Added to Today's Offer", { item: created });
  } catch (error) {
    console.error("Error adding to store Today's Offer:", error);
    return errorResponse(res, 500, "Failed to add to Today's Offer");
  }
});

/** PATCH /api/grocery/store/todays-offer/:id   Body: { startsAt?, endsAt? } */
export const updateStoreTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid id');
    }

    // Scoped to the caller's store so one store cannot edit another's entry.
    const item = await MofoodProductSectionItem.findOne({ _id: id, ...ownFilter(req.store) });
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
    console.error("Error updating store Today's Offer:", error);
    return errorResponse(res, 500, "Failed to update Today's Offer");
  }
});

/** DELETE /api/grocery/store/todays-offer/:id */
export const removeStoreTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid id');
    }

    const deleted = await MofoodProductSectionItem.findOneAndDelete({ _id: id, ...ownFilter(req.store) }).lean();
    if (!deleted) {
      return errorResponse(res, 404, "Today's Offer entry not found");
    }

    return successResponse(res, 200, "Removed from Today's Offer", { id });
  } catch (error) {
    console.error("Error removing from store Today's Offer:", error);
    return errorResponse(res, 500, "Failed to remove from Today's Offer");
  }
});

/**
 * PATCH /api/grocery/store/todays-offer/reorder   Body: { ids: [...] }
 *
 * The section also holds admin entries and other stores' products, so a store
 * reorders only among its own: its entries swap between the positions they
 * already occupy, leaving everyone else's where they were.
 */
export const reorderStoreTodaysOffer = asyncHandler(async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'ids must be a non-empty array');
    }
    if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id)) || new Set(ids.map(String)).size !== ids.length) {
      return errorResponse(res, 400, 'ids contains an invalid or repeated value');
    }

    const owned = await MofoodProductSectionItem.find({ _id: { $in: ids }, ...ownFilter(req.store) })
      .select('_id order')
      .lean();

    // Reject the whole request rather than partially applying an order that
    // includes entries the caller does not own.
    if (owned.length !== ids.length) {
      return errorResponse(res, 400, 'One or more entries do not belong to your store');
    }

    const slots = owned.map((entry) => Number(entry.order || 0)).sort((a, b) => a - b);
    await MofoodProductSectionItem.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order: slots[index] } } },
      })),
    );

    return successResponse(res, 200, 'Order updated successfully', { ids });
  } catch (error) {
    console.error("Error reordering store Today's Offer:", error);
    return errorResponse(res, 500, 'Failed to reorder');
  }
});
