import express from 'express';
import {
  createCategoryRequest,
  createSubcategoryRequest,
  getStoreCategoryRequests,
  getStoreSubcategoryRequests
} from '../controllers/groceryStoreCategoryRequestController.js';
import { authenticate } from '../middleware/groceryStoreAuth.js';

const router = express.Router();

// Category request routes - requires grocery store authentication
router.post('/category-requests', authenticate, createCategoryRequest);
router.get('/category-requests', authenticate, getStoreCategoryRequests);

// Subcategory request routes - requires grocery store authentication
router.post('/subcategory-requests', authenticate, createSubcategoryRequest);
router.get('/subcategory-requests', authenticate, getStoreSubcategoryRequests);

export default router;
