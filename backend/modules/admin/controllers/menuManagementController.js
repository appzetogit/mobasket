import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Menu from '../../restaurant/models/Menu.js';
import mongoose from 'mongoose';

const generateId = (prefix = 'id') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeImageUrl = (value) => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    return normalizeImageUrl(value.url || value.image || value.imageUrl || value.secure_url || '');
  }
  return '';
};

const findRestaurantByIdentifier = async (restaurantId) => {
  if (!restaurantId) return null;

  const orConditions = [{ restaurantId }, { slug: restaurantId }];
  if (mongoose.Types.ObjectId.isValid(restaurantId) && String(restaurantId).length === 24) {
    orConditions.push({ _id: new mongoose.Types.ObjectId(restaurantId) });
  }

  return Restaurant.findOne({ $or: orConditions });
};

const extractNonEmptyImages = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        return normalizeImageUrl(entry.url || entry.image || entry.imageUrl || entry.secure_url || '');
      }
      return '';
    })
    .filter(Boolean);
};

const findMenuItemById = (sections = [], itemId) => {
  for (const section of sections || []) {
    const sectionItems = Array.isArray(section?.items) ? section.items : [];
    const directItem = sectionItems.find((item) => String(item?.id) === String(itemId));
    if (directItem) {
      return { item: directItem, section, subsection: null };
    }

    for (const subsection of section?.subsections || []) {
      const subsectionItems = Array.isArray(subsection?.items) ? subsection.items : [];
      const nestedItem = subsectionItems.find((item) => String(item?.id) === String(itemId));
      if (nestedItem) {
        return { item: nestedItem, section, subsection };
      }
    }
  }

  return null;
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

  const normalizedImages = extractNonEmptyImages(item.images);
  const normalizedImage =
    normalizeImageUrl(item.image) ||
    normalizedImages[0] ||
    '';

  const newItem = {
    id: generateId('item'),
    name: String(item.name).trim(),
    nameArabic: item.nameArabic || '',
    image: normalizedImage,
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
    images: normalizedImages.length > 0 ? normalizedImages : (normalizedImage ? [normalizedImage] : []),
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

export const updateRestaurantMenuItemByAdmin = asyncHandler(async (req, res) => {
  const { restaurantId, itemId } = req.params;
  const { item = {} } = req.body || {};

  if (!itemId) {
    return errorResponse(res, 400, 'Item ID is required');
  }
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

  const menu = await Menu.findOne({ restaurant: restaurant._id });
  if (!menu) {
    return errorResponse(res, 404, 'Restaurant menu not found');
  }

  const found = findMenuItemById(menu.sections, String(itemId));
  if (!found?.item) {
    return errorResponse(res, 404, 'Menu item not found');
  }

  const nextImages = extractNonEmptyImages(item.images);
  const nextImage =
    normalizeImageUrl(item.image) ||
    nextImages[0] ||
    normalizeImageUrl(found.item.image) ||
    '';

  found.item.name = String(item.name).trim();
  found.item.price = Number(item.price);
  found.item.foodType = item.foodType === 'Veg' ? 'Veg' : 'Non-Veg';
  found.item.description = String(item.description || '').trim();
  found.item.image = nextImage;
  found.item.images = nextImages.length > 0 ? nextImages : (nextImage ? [nextImage] : []);
  found.item.isAvailable = item.isAvailable !== false;
  found.item.category = String(item.category || found.section?.name || found.item.category || '').trim() || found.item.category;
  found.item.approvalStatus = found.item.approvalStatus || 'approved';

  menu.markModified('sections');
  await menu.save();

  return successResponse(res, 200, 'Menu item updated successfully', {
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      restaurantId: restaurant.restaurantId
    },
    item: found.item
  });
});
