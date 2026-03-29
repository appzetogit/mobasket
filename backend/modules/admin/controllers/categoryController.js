import AdminCategoryManagement from '../models/AdminCategoryManagement.js';
import RestaurantCategory from '../../restaurant/models/RestaurantCategory.js';
import Zone from '../models/Zone.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { DEFAULT_IMAGE_FALLBACK_40 } from '../../../shared/utils/imageFallback.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

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

const resolveRestaurantZone = (restaurant = {}, zones = []) => {
  const restaurantIdCandidates = new Set([
    String(restaurant?._id || '').trim(),
    String(restaurant?.restaurantId || '').trim(),
  ].filter(Boolean));

  const linkedZone = zones.find((zone) => {
    const linkedRestaurantId = String(zone?.restaurantId?._id || zone?.restaurantId || '').trim();
    return linkedRestaurantId && restaurantIdCandidates.has(linkedRestaurantId);
  });
  if (linkedZone) return linkedZone;

  const lat = Number(restaurant?.location?.latitude ?? restaurant?.location?.coordinates?.[1]);
  const lng = Number(restaurant?.location?.longitude ?? restaurant?.location?.coordinates?.[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return zones.find((zone) => isPointInZone(lat, lng, zone.coordinates || [])) || null;
};

/**
 * Get All Categories (Public - for user frontend)
 * GET /api/categories/public
 */
export const getPublicCategories = asyncHandler(async (req, res) => {
  try {
    // Active admin-managed categories
    const adminCategories = await AdminCategoryManagement.find({ status: true })
      .select('name image _id type')
      .sort({ createdAt: -1 })
      .lean();

    // Active restaurant-created categories (mofood only)
    const restaurantCategoriesRaw = await RestaurantCategory.find({ isActive: true })
      .select('name icon _id restaurant')
      .populate({
        path: 'restaurant',
        select: 'platform',
        match: { platform: 'mofood' }
      })
      .lean();

    const restaurantCategories = restaurantCategoriesRaw
      .filter((category) => Boolean(category.restaurant))
      .map((category) => ({
        _id: category._id,
        name: category.name,
        image: category.icon || '',
        type: null
      }));

    // Merge and de-duplicate by normalized category name
    const merged = [...adminCategories, ...restaurantCategories];
    const seenNames = new Set();
    const formattedCategories = [];

    for (const category of merged) {
      const normalizedName = String(category?.name || '').trim();
      if (!normalizedName) continue;

      const dedupeKey = normalizedName.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seenNames.has(dedupeKey)) continue;
      seenNames.add(dedupeKey);

      const slug = normalizedName.toLowerCase().replace(/\s+/g, '-');
      formattedCategories.push({
        id: category._id.toString(),
        name: normalizedName,
        image: category.image || DEFAULT_IMAGE_FALLBACK_40,
        type: category.type || null,
        slug
      });
    }

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories: formattedCategories
    });
  } catch (error) {
    logger.error(`Error fetching public categories: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch categories');
  }
});

/**
 * Get All Categories (Admin)
 * GET /api/admin/categories
 */
export const getCategories = asyncHandler(async (req, res) => {
  try {
    const { limit = 100, offset = 0, search, priority, status, zoneId } = req.query;
    const parsedLimit = Math.max(parseInt(limit, 10) || 100, 0);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const hasStatusFilter = status !== undefined;
    const normalizedStatus = status === 'true' || status === true;
    const hasZoneFilter = Boolean(String(zoneId || '').trim());
    const mofoodZones = !priority
      ? await Zone.find({
          isActive: true,
          $or: [{ platform: 'mofood' }, { platform: { $exists: false } }]
        })
          .select('_id name zoneName restaurantId coordinates')
          .lean()
      : [];

    // Build admin category query
    const adminQuery = {};

    // Search filter
    if (search) {
      adminQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } }
      ];
    }

    // Priority filter
    if (priority) {
      adminQuery.priority = priority;
    }

    // Status filter
    if (hasStatusFilter) {
      adminQuery.status = normalizedStatus;
    }

    const adminCategories = await AdminCategoryManagement.find(adminQuery).lean();

    // Include restaurant-level categories so admin can see categories created by all mofood restaurants.
    // Keep this excluded when priority filter is active because restaurant categories do not have a priority field.
    let restaurantCategories = [];
    if (!priority) {
      const restaurantQuery = {};
      if (search) {
        restaurantQuery.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      if (hasStatusFilter) {
        restaurantQuery.isActive = normalizedStatus;
      }

      const docs = await RestaurantCategory.find(restaurantQuery)
        .populate({
          path: 'restaurant',
          select: 'name platform restaurantId location',
          match: { platform: 'mofood' }
        })
        .lean();

      restaurantCategories = docs
        .filter((category) => Boolean(category.restaurant))
        .map((category) => {
          const matchedZone = resolveRestaurantZone(category.restaurant, mofoodZones);
          return {
            ...category,
            id: category._id?.toString(),
            status: category.isActive !== false,
            image: category.icon || DEFAULT_IMAGE_FALLBACK_40,
            type: 'Global',
            source: 'restaurant',
            readOnly: false,
            zoneId: matchedZone?._id ? String(matchedZone._id) : '',
            zoneName: matchedZone?.name || matchedZone?.zoneName || '',
          };
        })
        .filter((category) => !hasZoneFilter || String(category.zoneId || '') === String(zoneId).trim());
    }

    const normalizedAdminCategories = adminCategories.map((category) => ({
      ...category,
      id: category._id.toString(),
      source: 'admin',
      readOnly: false
    }));

    const mergedCategories = [...normalizedAdminCategories, ...restaurantCategories].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    const paginatedCategories = mergedCategories
      .slice(parsedOffset, parsedOffset + parsedLimit)
      .map((category, index) => ({
        ...category,
        sl: parsedOffset + index + 1
      }));

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories: paginatedCategories,
      total: mergedCategories.length,
      limit: parsedLimit,
      offset: parsedOffset
    });
  } catch (error) {
    logger.error(`Error fetching categories: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch categories');
  }
});

/**
 * Get Category by ID
 * GET /api/admin/categories/:id
 */
export const getCategoryById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AdminCategoryManagement.findById(id).lean();
    if (category) {
      return successResponse(res, 200, 'Category retrieved successfully', {
        category: {
          ...category,
          id: category._id.toString(),
          source: 'admin'
        }
      });
    }

    const restaurantCategory = await RestaurantCategory.findById(id)
      .populate({
        path: 'restaurant',
        select: 'name platform',
        match: { platform: 'mofood' }
      })
      .lean();

    if (!restaurantCategory || !restaurantCategory.restaurant) {
      return errorResponse(res, 404, 'Category not found');
    }

    return successResponse(res, 200, 'Category retrieved successfully', {
      category: {
        ...restaurantCategory,
        id: restaurantCategory._id.toString(),
        status: restaurantCategory.isActive !== false,
        image: restaurantCategory.icon || DEFAULT_IMAGE_FALLBACK_40,
        type: 'Global',
        source: 'restaurant'
      }
    });
  } catch (error) {
    logger.error(`Error fetching category: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch category');
  }
});

/**
 * Create Category
 * POST /api/admin/categories
 */
export const createCategory = asyncHandler(async (req, res) => {
  try {
    const { name, image, status, type } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return errorResponse(res, 400, 'Category name is required');
    }

    // Check if category with same name already exists
    const existingCategory = await AdminCategoryManagement.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (existingCategory) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }

    let imageUrl = DEFAULT_IMAGE_FALLBACK_40;

    // Handle image upload if file is provided (priority: file > URL string)
    if (req.file) {
      try {
        const folder = 'mobasket/admin/categories';
        const result = await uploadToCloudinary(req.file.buffer, {
          folder,
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'auto' },
            { quality: 'auto' }
          ]
        });
        imageUrl = result.secure_url;
        logger.info(`Image uploaded to Cloudinary: ${imageUrl}`);
      } catch (uploadError) {
        logger.error(`Error uploading image: ${uploadError.message}`);
        return errorResponse(res, 500, 'Failed to upload image');
      }
    } else if (image && typeof image === 'string' && image.trim() !== '') {
      // Use provided image URL if no file is uploaded
      imageUrl = image.trim();
    }

    // Create new category
    const categoryData = {
      name: name.trim(),
      image: imageUrl,
      type: type && type.trim() ? type.trim() : undefined,
      priority: 'Normal', // Default priority
      status: status !== undefined ? status : true,
      description: '',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    };

    const category = await AdminCategoryManagement.create(categoryData);

    logger.info(`Category created: ${category._id}`, {
      name: category.name,
      createdBy: req.user._id
    });

    return successResponse(res, 201, 'Category created successfully', {
      category: {
        ...category.toObject(),
        id: category._id.toString()
      }
    });
  } catch (error) {
    logger.error(`Error creating category: ${error.message}`);
    
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }
    
    return errorResponse(res, 500, 'Failed to create category');
  }
});

/**
 * Update Category
 * PUT /api/admin/categories/:id
 */
export const updateCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, image, status, type } = req.body;

    const category = await AdminCategoryManagement.findById(id);

    if (category) {
      // Check if name is being changed and if it conflicts with existing category
      if (name && name.trim() !== category.name) {
        const existingCategory = await AdminCategoryManagement.findOne({
          name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
          _id: { $ne: id }
        });

        if (existingCategory) {
          return errorResponse(res, 400, 'Category with this name already exists');
        }
      }

      // Handle image upload if file is provided (priority: file > existing image > URL string)
      let imageUrl = category.image; // Keep existing image by default
      
      if (req.file) {
        try {
          const folder = 'mobasket/admin/categories';
          const result = await uploadToCloudinary(req.file.buffer, {
            folder,
            resource_type: 'image',
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'auto' },
              { quality: 'auto' }
            ]
          });
          imageUrl = result.secure_url;
          logger.info(`Image uploaded to Cloudinary: ${imageUrl}`);
        } catch (uploadError) {
          logger.error(`Error uploading image: ${uploadError.message}`);
          return errorResponse(res, 500, 'Failed to upload image');
        }
      } else if (image && typeof image === 'string' && image.trim() !== '') {
        // Use provided image URL if no file is uploaded
        imageUrl = image.trim();
      }

      // Update fields
      if (name !== undefined) category.name = name.trim();
      if (imageUrl !== undefined) category.image = imageUrl;
      if (type !== undefined) category.type = type && type.trim() ? type.trim() : undefined;
      if (status !== undefined) category.status = status;
      category.updatedBy = req.user._id;

      await category.save();

      logger.info(`Category updated: ${id}`, {
        updatedBy: req.user._id
      });

      return successResponse(res, 200, 'Category updated successfully', {
        category: {
          ...category.toObject(),
          id: category._id.toString(),
          source: 'admin'
        }
      });
    }

    const restaurantCategory = await RestaurantCategory.findById(id).populate({
      path: 'restaurant',
      select: 'name platform',
      match: { platform: 'mofood' }
    });

    if (!restaurantCategory || !restaurantCategory.restaurant) {
      return errorResponse(res, 404, 'Category not found');
    }

    // Keep restaurant category icon in sync with image field used by admin UI.
    let iconUrl = restaurantCategory.icon || '';
    if (req.file) {
      try {
        const folder = 'mobasket/admin/categories';
        const result = await uploadToCloudinary(req.file.buffer, {
          folder,
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'auto' },
            { quality: 'auto' }
          ]
        });
        iconUrl = result.secure_url;
        logger.info(`Restaurant category image uploaded to Cloudinary: ${iconUrl}`);
      } catch (uploadError) {
        logger.error(`Error uploading image: ${uploadError.message}`);
        return errorResponse(res, 500, 'Failed to upload image');
      }
    } else if (image && typeof image === 'string' && image.trim() !== '') {
      iconUrl = image.trim();
    }

    if (name !== undefined) restaurantCategory.name = name.trim();
    if (status !== undefined) restaurantCategory.isActive = status === 'true' || status === true;
    if (iconUrl !== undefined) restaurantCategory.icon = iconUrl;
    await restaurantCategory.save();

    return successResponse(res, 200, 'Category updated successfully', {
      category: {
        ...restaurantCategory.toObject(),
        id: restaurantCategory._id.toString(),
        status: restaurantCategory.isActive !== false,
        image: restaurantCategory.icon || DEFAULT_IMAGE_FALLBACK_40,
        type: 'Global',
        source: 'restaurant'
      }
    });
  } catch (error) {
    logger.error(`Error updating category: ${error.message}`);
    
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }
    
    return errorResponse(res, 500, 'Failed to update category');
  }
});

/**
 * Delete Category
 * DELETE /api/admin/categories/:id
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AdminCategoryManagement.findById(id);

    if (category) {
      await AdminCategoryManagement.deleteOne({ _id: id });

      logger.info(`Category deleted: ${id}`, {
        deletedBy: req.user._id
      });

      return successResponse(res, 200, 'Category deleted successfully');
    }

    const restaurantCategory = await RestaurantCategory.findById(id).populate({
      path: 'restaurant',
      select: 'platform',
      match: { platform: 'mofood' }
    });

    if (!restaurantCategory || !restaurantCategory.restaurant) {
      return errorResponse(res, 404, 'Category not found');
    }

    if (restaurantCategory.itemCount > 0) {
      return errorResponse(
        res,
        400,
        'Cannot delete category with items. Please remove all items first or deactivate the category.'
      );
    }

    await RestaurantCategory.deleteOne({ _id: id });

    logger.info(`Category deleted: ${id}`, {
      deletedBy: req.user._id
    });

    return successResponse(res, 200, 'Category deleted successfully');
  } catch (error) {
    logger.error(`Error deleting category: ${error.message}`);
    return errorResponse(res, 500, 'Failed to delete category');
  }
});

/**
 * Toggle Category Status
 * PATCH /api/admin/categories/:id/status
 */
export const toggleCategoryStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AdminCategoryManagement.findById(id);

    if (category) {
      category.status = !category.status;
      category.updatedBy = req.user._id;
      await category.save();

      logger.info(`Category status toggled: ${id}`, {
        status: category.status,
        updatedBy: req.user._id
      });

      return successResponse(res, 200, 'Category status updated successfully', {
        category: {
          ...category.toObject(),
          id: category._id.toString(),
          source: 'admin'
        }
      });
    }

    const restaurantCategory = await RestaurantCategory.findById(id).populate({
      path: 'restaurant',
      select: 'name platform',
      match: { platform: 'mofood' }
    });

    if (!restaurantCategory || !restaurantCategory.restaurant) {
      return errorResponse(res, 404, 'Category not found');
    }

    restaurantCategory.isActive = !restaurantCategory.isActive;
    await restaurantCategory.save();

    return successResponse(res, 200, 'Category status updated successfully', {
      category: {
        ...restaurantCategory.toObject(),
        id: restaurantCategory._id.toString(),
        status: restaurantCategory.isActive !== false,
        image: restaurantCategory.icon || DEFAULT_IMAGE_FALLBACK_40,
        type: 'Global',
        source: 'restaurant'
      }
    });
  } catch (error) {
    logger.error(`Error toggling category status: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update category status');
  }
});

/**
 * Update Category Priority
 * PATCH /api/admin/categories/:id/priority
 */
export const updateCategoryPriority = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!priority || !['High', 'Normal', 'Low'].includes(priority)) {
      return errorResponse(res, 400, 'Valid priority (High, Normal, Low) is required');
    }

    const category = await AdminCategoryManagement.findById(id);

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    category.priority = priority;
    category.updatedBy = req.user._id;
    await category.save();

    logger.info(`Category priority updated: ${id}`, {
      priority,
      updatedBy: req.user._id
    });

    return successResponse(res, 200, 'Category priority updated successfully', {
      category: {
        ...category.toObject(),
        id: category._id.toString()
      }
    });
  } catch (error) {
    logger.error(`Error updating category priority: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update category priority');
  }
});



