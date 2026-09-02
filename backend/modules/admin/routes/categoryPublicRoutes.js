import express from 'express';
import {
  getPublicCategories,
  getPublicCategoriesWithProducts,
} from '../controllers/categoryController.js';

const router = express.Router();

// Public routes - no authentication required
router.get('/categories/public', getPublicCategories);
router.get('/categories/public/with-products', getPublicCategoriesWithProducts);

export default router;

