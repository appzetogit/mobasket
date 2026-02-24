import express from 'express';
import {
  getGroceryStoreOrders,
  getGroceryStoreOrderById,
  acceptOrder,
  rejectOrder,
  markOrderPreparing,
  markOrderReady,
  resendDeliveryNotification
} from '../controllers/groceryStoreOrderController.js';
import { authenticate } from '../middleware/groceryStoreAuth.js';

const router = express.Router();

// Order routes - each route requires grocery store authentication
router.get('/orders', authenticate, getGroceryStoreOrders);
router.get('/orders/:id', authenticate, getGroceryStoreOrderById);
router.patch('/orders/:id/accept', authenticate, acceptOrder);
router.patch('/orders/:id/reject', authenticate, rejectOrder);
router.patch('/orders/:id/preparing', authenticate, markOrderPreparing);
router.patch('/orders/:id/ready', authenticate, markOrderReady);
router.post('/orders/:id/resend-delivery-notification', authenticate, resendDeliveryNotification);

export default router;
