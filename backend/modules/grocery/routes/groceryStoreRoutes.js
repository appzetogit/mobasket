import express from 'express';
import { authenticateAdmin } from '../../admin/middleware/adminAuth.js';
import {
  getGroceryStores,
  createGroceryStore,
  getGroceryStoreById,
  updateGroceryStore,
  updateGroceryStoreStatus,
  deleteGroceryStore
} from '../controllers/groceryStoreController.js';

const router = express.Router();

// All store management routes require admin authentication
router.use(authenticateAdmin);

router.get('/', getGroceryStores);
router.post('/', createGroceryStore);
router.get('/:id', getGroceryStoreById);
router.put('/:id', updateGroceryStore);
router.patch('/:id/status', updateGroceryStoreStatus);
router.delete('/:id', deleteGroceryStore);

export default router;
