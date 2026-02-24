import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Menu from '../../restaurant/models/Menu.js';
import mongoose from 'mongoose';

const generateId = (prefix = 'id') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const findRestaurantByIdentifier = async (restaurantId) => {
  if (!restaurantId) return null;

  const orConditions = [{ restaurantId }, { slug: restaurantId }];
  if (mongoose.Types.ObjectId.isValid(restaurantId) && String(restaurantId).length === 24) {
    orConditions.push({ _id: new mongoose.Types.ObjectId(restaurantId) });
  }

  return Restaurant.findOne({ $or: orConditions });
};

export const getRestaurantMenuForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  const restaurant = await findRestaurantByIdentifier(String(restaurantId || '').trim());
  if (!restaurant) {
    return errorResponse(res, 404, 'Restaurant not found');
  }

  const menu = await Menu.findOne({ restaurant: restaurant._id }).lean();

  return successResponse(res, 200, 'Restaurant menu fetched successfully', {
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      restaurantId: restaurant.restaurantId,
      platform: restaurant.platform
    },
    menu: menu || {
      restaurant: restaurant._id,
      sections: [],
      addons: [],
      isActive: true
    }
  });
});

export const addRestaurantMenuItemByAdmin = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const {
    sectionId,
    sectionName,
    subsectionId,
    subsectionName,
    item = {}
  } = req.body || {};
  const adminId = req.user?._id || req.admin?._id || null;

  if (!item?.name || !String(item.name).trim()) {
    return errorResponse(res, 400, 'Item name is required');
  }
  if (item?.price === undefined || Number.isNaN(Number(item.price))) {
    return errorResponse(res, 400, 'Valid item price is required');
  }

  const restaurant = await findRestaurantByIdentifier(String(restaurantId || '').trim());
  if (!restaurant) {
    return errorResponse(res, 404, 'Restaurant not found');
  }

  let menu = await Menu.findOne({ restaurant: restaurant._id });
  if (!menu) {
    menu = await Menu.create({
      restaurant: restaurant._id,
      sections: [],
      addons: [],
      isActive: true
    });
  }

  let targetSection = null;
  if (sectionId) {
    targetSection = menu.sections.find((section) => String(section.id) === String(sectionId));
  }
  if (!targetSection && sectionName) {
    const normalized = String(sectionName).trim().toLowerCase();
    targetSection = menu.sections.find((section) => String(section.name || '').trim().toLowerCase() === normalized);
  }

  if (!targetSection) {
    targetSection = {
      id: sectionId || generateId('section'),
      name: String(sectionName || 'General').trim(),
      items: [],
      subsections: [],
      isEnabled: true,
      order: menu.sections.length
    };
    menu.sections.push(targetSection);
    targetSection = menu.sections[menu.sections.length - 1];
  }

  const newItem = {
    id: generateId('item'),
    name: String(item.name).trim(),
    nameArabic: item.nameArabic || '',
    image: item.image || '',
    category: item.category || targetSection.name,
    rating: Number(item.rating || 0),
    reviews: Number(item.reviews || 0),
    price: Number(item.price),
    stock: item.stock ?? 'Unlimited',
    discount: item.discount ?? null,
    originalPrice: item.originalPrice ?? null,
    foodType: item.foodType === 'Veg' ? 'Veg' : 'Non-Veg',
    availabilityTimeStart: item.availabilityTimeStart || '12:01 AM',
    availabilityTimeEnd: item.availabilityTimeEnd || '11:57 PM',
    description: item.description || '',
    discountType: item.discountType || 'Percent',
    discountAmount: Number(item.discountAmount || 0),
    isAvailable: item.isAvailable !== false,
    isRecommended: item.isRecommended === true,
    variations: Array.isArray(item.variations) ? item.variations : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
    allergies: Array.isArray(item.allergies) ? item.allergies : [],
    photoCount: Number(item.photoCount || 1),
    subCategory: item.subCategory || '',
    servesInfo: item.servesInfo || '',
    itemSize: item.itemSize || '',
    itemSizeQuantity: item.itemSizeQuantity || '',
    itemSizeUnit: item.itemSizeUnit || 'piece',
    gst: Number(item.gst || 0),
    images: Array.isArray(item.images) ? item.images.filter(Boolean) : (item.image ? [item.image] : []),
    preparationTime: item.preparationTime || '',
    approvalStatus: 'approved',
    requestedAt: new Date(),
    approvedAt: new Date(),
    approvedBy: adminId,
    rejectionReason: ''
  };

  if (subsectionId || subsectionName) {
    let targetSubsection = null;

    if (subsectionId) {
      targetSubsection = (targetSection.subsections || []).find(
        (subsection) => String(subsection.id) === String(subsectionId)
      );
    }
    if (!targetSubsection && subsectionName) {
      const normalizedSubsectionName = String(subsectionName).trim().toLowerCase();
      targetSubsection = (targetSection.subsections || []).find(
        (subsection) => String(subsection.name || '').trim().toLowerCase() === normalizedSubsectionName
      );
    }
    if (!targetSubsection) {
      targetSubsection = {
        id: subsectionId || generateId('subsection'),
        name: String(subsectionName || 'General').trim(),
        items: []
      };
      targetSection.subsections = targetSection.subsections || [];
      targetSection.subsections.push(targetSubsection);
      targetSubsection = targetSection.subsections[targetSection.subsections.length - 1];
    }

    targetSubsection.items.push(newItem);
  } else {
    targetSection.items = targetSection.items || [];
    targetSection.items.push(newItem);
  }

  menu.markModified('sections');
  await menu.save();

  return successResponse(res, 201, 'Menu item added successfully', {
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      restaurantId: restaurant.restaurantId
    },
    item: newItem,
    menu: {
      sections: menu.sections,
      addons: menu.addons,
      isActive: menu.isActive
    }
  });
});
