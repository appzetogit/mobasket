import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Menu from '../../restaurant/models/Menu.js';
import Zone from '../models/Zone.js';
import mongoose from 'mongoose';

const generateId = (prefix = 'id') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getAdminAssignedZoneIds = (admin = null) => {
  if (!admin || String(admin?.role || '').toLowerCase() === 'super_admin') return [];
  return Array.from(
    new Set(
      (Array.isArray(admin?.assignedZoneIds) ? admin.assignedZoneIds : [])
        .map((zone) => String(zone?._id || zone || '').trim())
        .filter(Boolean)
    )
  );
};

const isPointInZone = (lat, lng, zoneCoordinates = []) => {
  if (!Array.isArray(zoneCoordinates) || zoneCoordinates.length < 3) return false;
  let inside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];
    const xi = typeof coordI === 'object' ? Number(coordI.latitude ?? coordI.lat) : NaN;
    const yi = typeof coordI === 'object' ? Number(coordI.longitude ?? coordI.lng) : NaN;
    const xj = typeof coordJ === 'object' ? Number(coordJ.latitude ?? coordJ.lat) : NaN;
    const yj = typeof coordJ === 'object' ? Number(coordJ.longitude ?? coordJ.lng) : NaN;
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const canAdminAccessRestaurant = async (admin = null, restaurant = null) => {
  const assignedZoneIds = getAdminAssignedZoneIds(admin);
  if (assignedZoneIds.length === 0) return true;

  const scopedZones = await Zone.find({
    _id: { $in: assignedZoneIds },
    isActive: true,
    $or: [{ platform: 'mofood' }, { platform: { $exists: false } }]
  })
    .select('_id restaurantId coordinates')
    .lean();

  const explicitZoneId = String(restaurant?.zoneId?._id || restaurant?.zoneId || '').trim();
  if (explicitZoneId && scopedZones.some((zone) => String(zone._id) === explicitZoneId)) return true;

  const restaurantIdCandidates = new Set([
    String(restaurant?._id || '').trim(),
    String(restaurant?.restaurantId || '').trim()
  ].filter(Boolean));

  if (scopedZones.some((zone) => {
    const linkedRestaurantId = String(zone?.restaurantId?._id || zone?.restaurantId || '').trim();
    return linkedRestaurantId && restaurantIdCandidates.has(linkedRestaurantId);
  })) {
    return true;
  }

  const lat = Number(restaurant?.location?.latitude ?? restaurant?.location?.coordinates?.[1]);
  const lng = Number(restaurant?.location?.longitude ?? restaurant?.location?.coordinates?.[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  return scopedZones.some((zone) => isPointInZone(lat, lng, zone.coordinates || []));
};

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

const getSectionKey = (section = {}, index = 0) =>
  String(section?.id || section?.name || `section-${index}`);

const sanitizeItemForAdmin = (item = {}, includeImages = true) => ({
  id: item?.id || '',
  name: item?.name || '',
  price: Number(item?.price || 0),
  foodType: item?.foodType === 'Veg' ? 'Veg' : 'Non-Veg',
  description: item?.description || '',
  isAvailable: item?.isAvailable !== false,
  image: includeImages ? (item?.image || '') : '',
  images: includeImages ? (Array.isArray(item?.images) ? item.images : []) : []
});

const sanitizeSectionForAdmin = (section = {}, includeImages = true) => ({
  ...section,
  items: Array.isArray(section?.items)
    ? section.items.map((item) => sanitizeItemForAdmin(item, includeImages))
    : [],
  subsections: Array.isArray(section?.subsections)
    ? section.subsections.map((subsection) => ({
      ...subsection,
      items: Array.isArray(subsection?.items)
        ? subsection.items.map((item) => sanitizeItemForAdmin(item, includeImages))
        : []
    }))
    : []
});

export const getRestaurantMenuForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const lite = String(req.query?.lite || '').toLowerCase() === 'true';
  const includeImagesRaw = String(req.query?.includeImages || '').trim().toLowerCase();
  const includeImages = includeImagesRaw ? includeImagesRaw === 'true' : true;
  const sectionId = String(req.query?.sectionId || '').trim();
  const sectionKey = String(req.query?.sectionKey || '').trim();

  const restaurant = await findRestaurantByIdentifier(String(restaurantId || '').trim());
  if (!restaurant) {
    return errorResponse(res, 404, 'Restaurant not found');
  }
  if (!(await canAdminAccessRestaurant(req.user || req.admin, restaurant))) {
    return errorResponse(res, 403, 'Access denied for restaurants outside your assigned zones');
  }

  const menu = sectionId
    ? await Menu.findOne(
      { restaurant: restaurant._id, 'sections.id': sectionId },
      {
        _id: 1,
        restaurant: 1,
        isActive: 1,
        'sections.$': 1
      }
    ).lean()
    : await Menu.findOne({ restaurant: restaurant._id }).lean();
  const fallbackMenu = {
    restaurant: restaurant._id,
    sections: [],
    addons: [],
    isActive: true
  };
  const resolvedMenu = menu || fallbackMenu;

  if (lite) {
    const sections = Array.isArray(resolvedMenu.sections) ? resolvedMenu.sections : [];
    const categories = sections.map((section, index) => ({
      id: section?.id || '',
      key: getSectionKey(section, index),
      name: section?.name || 'Unnamed Section',
      itemCount:
        (Array.isArray(section?.items) ? section.items.length : 0) +
        (Array.isArray(section?.subsections)
          ? section.subsections.reduce(
            (sum, subsection) => sum + (Array.isArray(subsection?.items) ? subsection.items.length : 0),
            0
          )
          : 0)
    }));

    return successResponse(res, 200, 'Restaurant menu categories fetched successfully', {
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        restaurantId: restaurant.restaurantId,
        platform: restaurant.platform
      },
      categories
    });
  }

  let sections = Array.isArray(resolvedMenu.sections) ? resolvedMenu.sections : [];
  if (!sectionId && sectionKey) {
    sections = sections.filter((section, index) => getSectionKey(section, index) === sectionKey);
  }

  const sanitizedSections = sections.map((section) => sanitizeSectionForAdmin(section, includeImages));

  return successResponse(res, 200, 'Restaurant menu fetched successfully', {
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      restaurantId: restaurant.restaurantId,
      platform: restaurant.platform
    },
    menu: {
      ...resolvedMenu,
      sections: sanitizedSections,
      addons: []
    }
  });
});

export const getRestaurantMenuCategoriesForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  const restaurant = await findRestaurantByIdentifier(String(restaurantId || '').trim());
  if (!restaurant) {
    return errorResponse(res, 404, 'Restaurant not found');
  }
  if (!(await canAdminAccessRestaurant(req.user || req.admin, restaurant))) {
    return errorResponse(res, 403, 'Access denied for restaurants outside your assigned zones');
  }

  const menu = await Menu.findOne(
    { restaurant: restaurant._id },
    {
      _id: 1,
      restaurant: 1,
      isActive: 1,
      'sections.id': 1,
      'sections.name': 1
    }
  ).lean();

  const sections = Array.isArray(menu?.sections) ? menu.sections : [];
  const categories = sections.map((section, index) => ({
    id: section?.id || '',
    key: getSectionKey(section, index),
    name: section?.name || 'Unnamed Section'
  }));

  return successResponse(res, 200, 'Restaurant menu categories fetched successfully', {
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      restaurantId: restaurant.restaurantId,
      platform: restaurant.platform
    },
    categories
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
  if (!(await canAdminAccessRestaurant(req.user || req.admin, restaurant))) {
    return errorResponse(res, 403, 'Access denied for restaurants outside your assigned zones');
  }
  if (!(await canAdminAccessRestaurant(req.user || req.admin, restaurant))) {
    return errorResponse(res, 403, 'Access denied for restaurants outside your assigned zones');
  }

  const nextImages = extractNonEmptyImages(item.images);
  const normalizedImage = normalizeImageUrl(item.image);
  const nextImage = normalizedImage || nextImages[0] || '';
  const nextImagesValue = nextImages.length > 0 ? nextImages : (nextImage ? [nextImage] : []);

  const patchFields = {
    name: String(item.name).trim(),
    price: Number(item.price),
    foodType: item.foodType === 'Veg' ? 'Veg' : 'Non-Veg',
    description: String(item.description || '').trim(),
    isAvailable: item.isAvailable !== false,
    approvalStatus: 'approved'
  };
  if (item.category !== undefined) {
    const categoryValue = String(item.category || '').trim();
    if (categoryValue) patchFields.category = categoryValue;
  }
  if (normalizedImage || nextImages.length > 0) {
    patchFields.image = nextImage;
    patchFields.images = nextImagesValue;
  }

  const itemIdString = String(itemId);
  const setDirect = Object.fromEntries(
    Object.entries(patchFields).map(([key, value]) => [`sections.$[].items.$[menuItem].${key}`, value]),
  );
  const setNested = Object.fromEntries(
    Object.entries(patchFields).map(([key, value]) => [`sections.$[].subsections.$[].items.$[menuItem].${key}`, value]),
  );

  const directResult = await Menu.updateOne(
    { restaurant: restaurant._id, 'sections.items.id': itemIdString },
    { $set: setDirect },
    {
      arrayFilters: [{ 'menuItem.id': itemIdString }],
    },
  );

  let matchedCount = Number(directResult?.matchedCount || 0);
  if (matchedCount === 0) {
    const nestedResult = await Menu.updateOne(
      { restaurant: restaurant._id, 'sections.subsections.items.id': itemIdString },
      { $set: setNested },
      {
        arrayFilters: [{ 'menuItem.id': itemIdString }],
      },
    );
    matchedCount = Number(nestedResult?.matchedCount || 0);
  }

  if (matchedCount === 0) {
    return errorResponse(res, 404, 'Menu item not found');
  }

  return successResponse(res, 200, 'Menu item updated successfully', {
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      restaurantId: restaurant.restaurantId
    },
    item: {
      id: itemIdString,
      ...patchFields,
      image: patchFields.image || '',
      images: patchFields.images || []
    }
  });
});
