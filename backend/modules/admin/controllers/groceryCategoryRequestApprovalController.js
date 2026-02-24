import GroceryCategoryRequest from '../../grocery/models/GroceryCategoryRequest.js';
import GrocerySubcategoryRequest from '../../grocery/models/GrocerySubcategoryRequest.js';
import GroceryCategory from '../../grocery/models/GroceryCategory.js';
import GrocerySubcategory from '../../grocery/models/GrocerySubcategory.js';

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

// Get pending category requests
export const getPendingCategoryRequests = async (req, res) => {
  try {
    const requests = await GroceryCategoryRequest.find({
      approvalStatus: 'pending'
    })
      .populate('storeId', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending category requests', 
      error: error.message 
    });
  }
};

// Get pending subcategory requests
export const getPendingSubcategoryRequests = async (req, res) => {
  try {
    const requests = await GrocerySubcategoryRequest.find({
      approvalStatus: 'pending'
    })
      .populate('storeId', 'name email phone')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending subcategory requests', 
      error: error.message 
    });
  }
};

// Approve category request
export const approveCategoryRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await GroceryCategoryRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Category request not found' });
    }

    if (request.approvalStatus !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${request.approvalStatus}` 
      });
    }

    // Check if category with same slug already exists
    const existingCategory = await GroceryCategory.findOne({ slug: request.slug }).lean();
    if (existingCategory) {
      return res.status(409).json({ 
        success: false, 
        message: 'A category with this slug already exists' 
      });
    }

    // Create the actual category
    const category = await GroceryCategory.create({
      name: request.name,
      slug: request.slug,
      image: request.image,
      description: request.description,
      section: request.section,
      order: request.order,
      isActive: request.isActive,
    });

    // Update request status
    request.approvalStatus = 'approved';
    request.approvedBy = req.admin._id;
    request.approvedAt = new Date();
    request.createdCategoryId = category._id;
    await request.save();

    return res.status(200).json({ 
      success: true, 
      message: 'Category request approved and category created successfully',
      data: { request, category }
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to approve category request', 
      error: error.message 
    });
  }
};

// Reject category request
export const rejectCategoryRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason = '' } = req.body;

    const request = await GroceryCategoryRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Category request not found' });
    }

    if (request.approvalStatus !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${request.approvalStatus}` 
      });
    }

    request.approvalStatus = 'rejected';
    request.rejectionReason = rejectionReason.trim();
    request.approvedBy = req.admin._id;
    request.approvedAt = new Date();
    await request.save();

    return res.status(200).json({ 
      success: true, 
      message: 'Category request rejected',
      data: request
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to reject category request', 
      error: error.message 
    });
  }
};

// Approve subcategory request
export const approveSubcategoryRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await GrocerySubcategoryRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Subcategory request not found' });
    }

    if (request.approvalStatus !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${request.approvalStatus}` 
      });
    }

    // Verify category exists
    const categoryExists = await GroceryCategory.findById(request.category).lean();
    if (!categoryExists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Category not found' 
      });
    }

    // Check if subcategory with same slug already exists in this category
    const existingSubcategory = await GrocerySubcategory.findOne({ 
      category: request.category,
      slug: request.slug 
    }).lean();
    
    if (existingSubcategory) {
      return res.status(409).json({ 
        success: false, 
        message: 'A subcategory with this slug already exists in this category' 
      });
    }

    // Create the actual subcategory
    const subcategory = await GrocerySubcategory.create({
      category: request.category,
      name: request.name,
      slug: request.slug,
      image: request.image,
      description: request.description,
      order: request.order,
      isActive: request.isActive,
    });

    // Update request status
    request.approvalStatus = 'approved';
    request.approvedBy = req.admin._id;
    request.approvedAt = new Date();
    request.createdSubcategoryId = subcategory._id;
    await request.save();

    return res.status(200).json({ 
      success: true, 
      message: 'Subcategory request approved and subcategory created successfully',
      data: { request, subcategory }
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to approve subcategory request', 
      error: error.message 
    });
  }
};

// Reject subcategory request
export const rejectSubcategoryRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason = '' } = req.body;

    const request = await GrocerySubcategoryRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Subcategory request not found' });
    }

    if (request.approvalStatus !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${request.approvalStatus}` 
      });
    }

    request.approvalStatus = 'rejected';
    request.rejectionReason = rejectionReason.trim();
    request.approvedBy = req.admin._id;
    request.approvedAt = new Date();
    await request.save();

    return res.status(200).json({ 
      success: true, 
      message: 'Subcategory request rejected',
      data: request
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to reject subcategory request', 
      error: error.message 
    });
  }
};
