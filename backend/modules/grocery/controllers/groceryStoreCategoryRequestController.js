import GroceryCategoryRequest from '../models/GroceryCategoryRequest.js';
import GrocerySubcategoryRequest from '../models/GrocerySubcategoryRequest.js';

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

// Create category request
export const createCategoryRequest = async (req, res) => {
  try {
    const { name, slug, image = '', description = '', section = 'Grocery & Kitchen', order = 0, isActive = true } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const normalizedSlug = slugify(slug || name);
    
    // Check if a pending request already exists for this store with the same name/slug
    const existingRequest = await GroceryCategoryRequest.findOne({
      storeId: req.store._id,
      $or: [
        { name: name.trim() },
        { slug: normalizedSlug }
      ],
      approvalStatus: 'pending'
    }).lean();

    if (existingRequest) {
      return res.status(409).json({ 
        success: false, 
        message: 'A pending request for this category already exists' 
      });
    }

    const categoryRequest = await GroceryCategoryRequest.create({
      storeId: req.store._id,
      name: name.trim(),
      slug: normalizedSlug,
      image,
      description,
      section,
      order: Number(order) || 0,
      isActive: Boolean(isActive),
      approvalStatus: 'pending',
    });

    return res.status(201).json({ 
      success: true, 
      message: 'Category request submitted successfully. It will be reviewed by admin.',
      data: categoryRequest 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create category request', 
      error: error.message 
    });
  }
};

// Create subcategory request
export const createSubcategoryRequest = async (req, res) => {
  try {
    const { category, name, slug, image = '', description = '', order = 0, isActive = true } = req.body;
    
    if (!category || !name) {
      return res.status(400).json({ success: false, message: 'Category and name are required' });
    }

    const normalizedSlug = slugify(slug || name);
    
    // Check if a pending request already exists for this store with the same name/slug in the same category
    const existingRequest = await GrocerySubcategoryRequest.findOne({
      storeId: req.store._id,
      category,
      $or: [
        { name: name.trim() },
        { slug: normalizedSlug }
      ],
      approvalStatus: 'pending'
    }).lean();

    if (existingRequest) {
      return res.status(409).json({ 
        success: false, 
        message: 'A pending request for this subcategory already exists' 
      });
    }

    const subcategoryRequest = await GrocerySubcategoryRequest.create({
      storeId: req.store._id,
      category,
      name: name.trim(),
      slug: normalizedSlug,
      image,
      description,
      order: Number(order) || 0,
      isActive: Boolean(isActive),
      approvalStatus: 'pending',
    });

    return res.status(201).json({ 
      success: true, 
      message: 'Subcategory request submitted successfully. It will be reviewed by admin.',
      data: subcategoryRequest 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create subcategory request', 
      error: error.message 
    });
  }
};

// Get store's category requests
export const getStoreCategoryRequests = async (req, res) => {
  try {
    const requests = await GroceryCategoryRequest.find({
      storeId: req.store._id
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch category requests', 
      error: error.message 
    });
  }
};

// Get store's subcategory requests
export const getStoreSubcategoryRequests = async (req, res) => {
  try {
    const requests = await GrocerySubcategoryRequest.find({
      storeId: req.store._id
    })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch subcategory requests', 
      error: error.message 
    });
  }
};
