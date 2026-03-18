import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Menu from '../../restaurant/models/Menu.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import winston from 'winston';
import mongoose from 'mongoose';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const resolvePlatformMatch = (platformQuery) => {
  const normalized = String(platformQuery || '').toLowerCase();

  if (normalized === 'mogrocery' || normalized === 'grocery') {
    return { $in: ['mogrocery', 'grocery'] };
  }

  // Default to mofood for this controller.
  // Include legacy restaurants where platform may be missing/blank.
  return { $in: ['mofood', 'food', '', null] };
};

const isPendingApprovalStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'pending';
};

const FOOD_APPROVAL_LIST_MENU_PROJECTION = [
  'restaurant',
  'createdAt',
  'sections.id',
  'sections.name',
  'sections.items.id',
  'sections.items.name',
  'sections.items.category',
  'sections.items.price',
  'sections.items.foodType',
  'sections.items.description',
  'sections.items.approvalStatus',
  'sections.items.requestedAt',
  'sections.subsections.id',
  'sections.subsections.name',
  'sections.subsections.items.id',
  'sections.subsections.items.name',
  'sections.subsections.items.category',
  'sections.subsections.items.price',
  'sections.subsections.items.foodType',
  'sections.subsections.items.description',
  'sections.subsections.items.approvalStatus',
  'sections.subsections.items.requestedAt',
  'addons.id',
  'addons.name',
  'addons.description',
  'addons.price',
  'addons.approvalStatus',
  'addons.requestedAt'
].join(' ');

const FOOD_APPROVAL_LOOKUP_MENU_PROJECTION = [
  'addons.id',
  'addons.approvalStatus',
  'sections.items.id',
  'sections.items.approvalStatus',
  'sections.subsections.items.id',
  'sections.subsections.items.approvalStatus'
].join(' ');

const buildApprovalMenuCandidates = async ({ platform, restaurantMongoId }) => {
  const menuQuery = { isActive: true };

  if (restaurantMongoId && mongoose.Types.ObjectId.isValid(String(restaurantMongoId))) {
    menuQuery.restaurant = new mongoose.Types.ObjectId(String(restaurantMongoId));
    return Menu.find(menuQuery)
      .select(FOOD_APPROVAL_LOOKUP_MENU_PROJECTION)
      .lean();
  }

  const normalizedPlatform = String(platform || '').toLowerCase();
  const platformMatch = resolvePlatformMatch(normalizedPlatform || 'mofood');
  const restaurants = await Restaurant.find({ platform: platformMatch }).select('_id').lean();
  const restaurantIds = restaurants.map((r) => r._id);

  if (restaurantIds.length === 0) return [];

  menuQuery.restaurant = { $in: restaurantIds };
  return Menu.find(menuQuery)
    .select(FOOD_APPROVAL_LOOKUP_MENU_PROJECTION)
    .lean();
};

/**
 * Get all pending food approval requests
 * GET /api/admin/food-approvals
 */
export const getPendingFoodApprovals = asyncHandler(async (req, res) => {
  try {
    const platformMatch = resolvePlatformMatch(req.query?.platform || 'mofood');
    const restaurants = await Restaurant.find({ platform: platformMatch })
      .select('_id name restaurantId')
      .lean();

    if (restaurants.length === 0) {
      return successResponse(res, 200, 'Pending food approvals retrieved successfully', {
        requests: [],
        total: 0
      });
    }

    const restaurantMap = new Map(
      restaurants.map((restaurant) => [String(restaurant._id), restaurant])
    );
    const restaurantIds = restaurants.map((restaurant) => restaurant._id);

    const menus = await Menu.find({
      isActive: true,
      restaurant: { $in: restaurantIds }
    })
      .select(FOOD_APPROVAL_LIST_MENU_PROJECTION)
      .lean();

    const pendingRequests = [];

    for (const menu of menus) {
      const restaurant = restaurantMap.get(String(menu.restaurant));
      if (!restaurant) continue;

      for (const section of menu.sections || []) {
        for (const item of section.items || []) {
          if (isPendingApprovalStatus(item.approvalStatus)) {
            pendingRequests.push({
              _id: item.id,
              id: item.id,
              type: 'item',
              itemName: item.name,
              category: item.category || '',
              restaurantId: restaurant.restaurantId,
              restaurantName: restaurant.name,
              restaurantMongoId: restaurant._id,
              sectionName: section.name,
              sectionId: section.id,
              price: item.price,
              foodType: item.foodType,
              description: item.description,
              image: item.image || (item.images && item.images[0]) || '',
              images: Array.isArray(item.images) && item.images.length > 0
                ? item.images.filter((img) => img && typeof img === 'string' && img.trim() !== '')
                : [],
              requestedAt: item.requestedAt || menu.createdAt,
              item
            });
          }
        }

        for (const subsection of section.subsections || []) {
          for (const item of subsection.items || []) {
            if (isPendingApprovalStatus(item.approvalStatus)) {
              pendingRequests.push({
                _id: item.id,
                id: item.id,
                type: 'item',
                itemName: item.name,
                category: item.category || '',
                restaurantId: restaurant.restaurantId,
                restaurantName: restaurant.name,
                restaurantMongoId: restaurant._id,
                sectionName: section.name,
                sectionId: section.id,
                subsectionName: subsection.name,
                subsectionId: subsection.id,
                price: item.price,
                foodType: item.foodType,
                description: item.description,
                image: item.image || (item.images && item.images[0]) || '',
                images: Array.isArray(item.images) && item.images.length > 0
                  ? item.images.filter((img) => img && typeof img === 'string' && img.trim() !== '')
                  : [],
                requestedAt: item.requestedAt || menu.createdAt,
                item
              });
            }
          }
        }
      }

      for (const addon of menu.addons || []) {
        if (isPendingApprovalStatus(addon.approvalStatus)) {
          pendingRequests.push({
            _id: addon.id,
            id: addon.id,
            type: 'addon',
            itemName: addon.name,
            category: 'Add-on',
            restaurantId: restaurant.restaurantId,
            restaurantName: restaurant.name,
            restaurantMongoId: restaurant._id,
            price: addon.price,
            description: addon.description,
            image: addon.image || (addon.images && addon.images[0]) || '',
            images: Array.isArray(addon.images) && addon.images.length > 0
              ? addon.images.filter((img) => img && typeof img === 'string' && img.trim() !== '')
              : [],
            requestedAt: addon.requestedAt || menu.createdAt,
            item: addon
          });
        }
      }
    }

    pendingRequests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    logger.info(`Fetched ${pendingRequests.length} pending food approval requests`);

    return successResponse(res, 200, 'Pending food approvals retrieved successfully', {
      requests: pendingRequests,
      total: pendingRequests.length
    });
  } catch (error) {
    logger.error(`Error fetching pending food approvals: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch pending food approvals');
  }
});

const findItemInMenu = (menu, id) => {
  const itemId = String(id);

  const addonIndex = (menu.addons || []).findIndex((a) => String(a.id) === itemId);
  if (addonIndex !== -1) {
    return { kind: 'addon', addonIndex };
  }

  for (let s = 0; s < (menu.sections || []).length; s += 1) {
    const section = menu.sections[s];
    const sectionItemIndex = (section.items || []).findIndex((i) => String(i.id) === itemId);
    if (sectionItemIndex !== -1) {
      return { kind: 'section-item', sectionIndex: s, itemIndex: sectionItemIndex };
    }

    for (let sub = 0; sub < (section.subsections || []).length; sub += 1) {
      const subsection = section.subsections[sub];
      const subsectionItemIndex = (subsection.items || []).findIndex((i) => String(i.id) === itemId);
      if (subsectionItemIndex !== -1) {
        return {
          kind: 'subsection-item',
          sectionIndex: s,
          subsectionIndex: sub,
          itemIndex: subsectionItemIndex
        };
      }
    }
  }

  return null;
};

/**
 * Approve a food item/add-on
 * POST /api/admin/food-approvals/:id/approve
 */
export const approveFoodItem = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id || req.admin?._id || null;
    const contextPlatform = req.body?.platform || req.query?.platform || 'mofood';
    const contextRestaurantMongoId = req.body?.restaurantMongoId || req.query?.restaurantMongoId;

    const menus = await buildApprovalMenuCandidates({
      platform: contextPlatform,
      restaurantMongoId: contextRestaurantMongoId
    });

    let foundMenuMeta = null;
    for (const menu of menus) {
      const loc = findItemInMenu(menu, id);
      if (loc) {
        foundMenuMeta = { menuId: menu._id, loc };
        break;
      }
    }

    if (!foundMenuMeta) {
      return errorResponse(res, 404, 'Food item or add-on not found');
    }

    const menu = await Menu.findById(foundMenuMeta.menuId);
    if (!menu) {
      return errorResponse(res, 404, 'Menu not found');
    }

    const { loc } = foundMenuMeta;
    let updatedItem = null;

    if (loc.kind === 'addon') {
      const addon = menu.addons[loc.addonIndex];
      if (!addon) return errorResponse(res, 404, 'Add-on not found');
      if (addon.approvalStatus === 'approved') {
        return errorResponse(res, 400, 'Food add-on is already approved');
      }
      addon.approvalStatus = 'approved';
      addon.approvedAt = new Date();
      addon.approvedBy = adminId;
      addon.rejectionReason = '';
      addon.rejectedAt = null;
      updatedItem = addon;
    } else if (loc.kind === 'section-item') {
      const item = menu.sections?.[loc.sectionIndex]?.items?.[loc.itemIndex];
      if (!item) return errorResponse(res, 404, 'Food item not found');
      if (item.approvalStatus === 'approved') {
        return errorResponse(res, 400, 'Food item is already approved');
      }
      item.approvalStatus = 'approved';
      item.approvedAt = new Date();
      item.approvedBy = adminId;
      item.rejectionReason = '';
      item.rejectedAt = null;
      updatedItem = item;
    } else {
      const item =
        menu.sections?.[loc.sectionIndex]?.subsections?.[loc.subsectionIndex]?.items?.[loc.itemIndex];
      if (!item) return errorResponse(res, 404, 'Food item not found');
      if (item.approvalStatus === 'approved') {
        return errorResponse(res, 400, 'Food item is already approved');
      }
      item.approvalStatus = 'approved';
      item.approvedAt = new Date();
      item.approvedBy = adminId;
      item.rejectionReason = '';
      item.rejectedAt = null;
      updatedItem = item;
    }

    menu.markModified('sections');
    menu.markModified('addons');
    await menu.save();

    logger.info(`Food item approved: ${id}`, {
      approvedBy: adminId,
      menuId: menu._id
    });

    return successResponse(res, 200, 'Food item approved successfully', {
      itemId: id,
      approvalStatus: updatedItem?.approvalStatus,
      approvedAt: updatedItem?.approvedAt,
      approvedBy: updatedItem?.approvedBy,
      message: 'Food item has been approved and is now visible to users'
    });
  } catch (error) {
    logger.error(`Error approving food item: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to approve food item');
  }
});

/**
 * Reject a food item/add-on
 * POST /api/admin/food-approvals/:id/reject
 */
export const rejectFoodItem = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?._id || req.admin?._id || null;
    const contextPlatform = req.body?.platform || req.query?.platform || 'mofood';
    const contextRestaurantMongoId = req.body?.restaurantMongoId || req.query?.restaurantMongoId;

    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, 'Rejection reason is required');
    }

    const menus = await buildApprovalMenuCandidates({
      platform: contextPlatform,
      restaurantMongoId: contextRestaurantMongoId
    });

    let foundMenuMeta = null;
    for (const menu of menus) {
      const loc = findItemInMenu(menu, id);
      if (loc) {
        foundMenuMeta = { menuId: menu._id, loc };
        break;
      }
    }

    if (!foundMenuMeta) {
      return errorResponse(res, 404, 'Food item or add-on not found');
    }

    const menu = await Menu.findById(foundMenuMeta.menuId);
    if (!menu) {
      return errorResponse(res, 404, 'Menu not found');
    }

    const { loc } = foundMenuMeta;
    let updatedItem = null;

    if (loc.kind === 'addon') {
      const addon = menu.addons[loc.addonIndex];
      if (!addon) return errorResponse(res, 404, 'Add-on not found');
      if (addon.approvalStatus === 'rejected') {
        return errorResponse(res, 400, 'Food add-on is already rejected');
      }
      addon.approvalStatus = 'rejected';
      addon.rejectionReason = reason.trim();
      addon.rejectedAt = new Date();
      addon.approvedBy = adminId;
      addon.approvedAt = null;
      updatedItem = addon;
    } else if (loc.kind === 'section-item') {
      const item = menu.sections?.[loc.sectionIndex]?.items?.[loc.itemIndex];
      if (!item) return errorResponse(res, 404, 'Food item not found');
      if (item.approvalStatus === 'rejected') {
        return errorResponse(res, 400, 'Food item is already rejected');
      }
      item.approvalStatus = 'rejected';
      item.rejectionReason = reason.trim();
      item.rejectedAt = new Date();
      item.approvedBy = adminId;
      item.approvedAt = null;
      updatedItem = item;
    } else {
      const item =
        menu.sections?.[loc.sectionIndex]?.subsections?.[loc.subsectionIndex]?.items?.[loc.itemIndex];
      if (!item) return errorResponse(res, 404, 'Food item not found');
      if (item.approvalStatus === 'rejected') {
        return errorResponse(res, 400, 'Food item is already rejected');
      }
      item.approvalStatus = 'rejected';
      item.rejectionReason = reason.trim();
      item.rejectedAt = new Date();
      item.approvedBy = adminId;
      item.approvedAt = null;
      updatedItem = item;
    }

    menu.markModified('sections');
    menu.markModified('addons');
    await menu.save();

    logger.info(`Food item rejected: ${id}`, {
      rejectedBy: adminId,
      menuId: menu._id,
      reason: reason.trim()
    });

    return successResponse(res, 200, 'Food item rejected successfully', {
      itemId: id,
      approvalStatus: updatedItem?.approvalStatus,
      rejectionReason: updatedItem?.rejectionReason,
      rejectedAt: updatedItem?.rejectedAt,
      message: 'Food item has been rejected and will not be visible to users'
    });
  } catch (error) {
    logger.error(`Error rejecting food item: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reject food item');
  }
});
