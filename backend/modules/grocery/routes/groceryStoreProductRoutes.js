import express from 'express';
import {
  getGroceryStoreProducts,
  getGroceryStoreProductById,
  updateGroceryStoreProductStock,
  createGroceryStoreProduct,
  updateGroceryStoreProduct,
  deleteGroceryStoreProduct
} from '../controllers/groceryStoreProductController.js';
import { authenticate } from '../middleware/groceryStoreAuth.js';

const router = express.Router();

// Product routes - each route requires grocery store authentication
router.get('/products', authenticate, getGroceryStoreProducts);
router.get('/products/:id', authenticate, getGroceryStoreProductById);
router.post('/products', authenticate, createGroceryStoreProduct);
router.put('/products/:id', authenticate, updateGroceryStoreProduct);
router.delete('/products/:id', authenticate, deleteGroceryStoreProduct);
router.patch('/products/:id/stock', authenticate, updateGroceryStoreProductStock);

export default router;
