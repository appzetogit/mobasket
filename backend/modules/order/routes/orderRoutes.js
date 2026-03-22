import express from 'express';
import {
  createOrder,
  verifyOrderPayment,
  getUserOrders,
  getOrderDetails,
  submitOrderReview,
  calculateOrder,
  cancelOrder,
  editOrderCart,
  verifyEditedOrderCartPayment,
  switchOrderToCash
} from '../controllers/orderController.js';
import { authenticate, optionalAuthenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// Calculate order pricing (public endpoint - no auth required for cart preview)
// This must be before the authenticate middleware
router.post('/calculate', optionalAuthenticate, calculateOrder);

// All other routes require authentication
router.use(authenticate);

// Create order and initiate payment
router.post('/', createOrder);

// Verify payment
router.post('/verify-payment', verifyOrderPayment);

// Get user orders
router.get('/', getUserOrders);

// Get order details
router.get('/:id', getOrderDetails);

// Submit restaurant/delivery review for a delivered order
router.patch('/:id/review', submitOrderReview);

// Cancel order
router.patch('/:id/cancel', cancelOrder);
router.patch('/:id/edit-cart', editOrderCart);
router.post('/:id/edit-cart/verify-payment', verifyEditedOrderCartPayment);
router.patch('/:id/switch-to-cod', switchOrderToCash);

export default router;

