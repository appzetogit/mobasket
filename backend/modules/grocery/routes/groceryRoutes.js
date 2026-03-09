import express from 'express';
import { authenticateAdmin } from '../../admin/middleware/adminAuth.js';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanOffers,
  getPlanOfferById,
  createPlanOffer,
  updatePlanOffer,
  deletePlanOffer,
  getPlanSubscriptions,
} from '../controllers/groceryController.js';
import {
  sendOTP as sendGroceryStoreOTP,
  verifyOTP as verifyGroceryStoreOTP,
  updateStoreProfile,
} from '../controllers/groceryStoreAuthController.js';
import groceryStoreAuthRoutes from './groceryStoreAuthRoutes.js';
import groceryStoreOrderRoutes from './groceryStoreOrderRoutes.js';
import groceryStoreProductRoutes from './groceryStoreProductRoutes.js';
import groceryStoreCategoryRequestRoutes from './groceryStoreCategoryRequestRoutes.js';
import { getOnboarding, updateOnboarding } from '../controllers/groceryStoreOnboardingController.js';
import { authenticate } from '../middleware/groceryStoreAuth.js';
import {
  getStoreNotifications,
  deleteStoreNotification,
  clearStoreNotifications,
} from '../controllers/groceryStoreNotificationController.js';
import {
  getWallet,
  getWalletTransactions,
  getWalletStats,
  createWithdrawalRequest,
  getWithdrawalRequests,
} from '../controllers/groceryStoreWalletController.js';
import {
  addAddon as addStoreAddon,
  getAddons as getStoreAddons,
  updateAddon as updateStoreAddon,
  deleteAddon as deleteStoreAddon,
} from '../../restaurant/controllers/menuController.js';

const router = express.Router();
const attachStoreAsRestaurant = (req, _res, next) => {
  req.restaurant = req.store;
  next();
};

// Categories
router.get('/categories', getCategories);
router.get('/categories/:id', getCategoryById);
router.post('/categories', authenticateAdmin, createCategory);
router.put('/categories/:id', authenticateAdmin, updateCategory);
router.delete('/categories/:id', authenticateAdmin, deleteCategory);

// Subcategories
router.get('/subcategories', getSubcategories);
router.get('/subcategories/:id', getSubcategoryById);
router.post('/subcategories', authenticateAdmin, createSubcategory);
router.put('/subcategories/:id', authenticateAdmin, updateSubcategory);
router.delete('/subcategories/:id', authenticateAdmin, deleteSubcategory);

// Products
router.get('/products', getProducts);
router.get('/products/:id', getProductById);
router.post('/products', authenticateAdmin, createProduct);
router.put('/products/:id', authenticateAdmin, updateProduct);
router.delete('/products/:id', authenticateAdmin, deleteProduct);

// Plans
router.get('/plans', getPlans);
router.get('/plans/:id', getPlanById);
router.post('/plans', authenticateAdmin, createPlan);
router.put('/plans/:id', authenticateAdmin, updatePlan);
router.delete('/plans/:id', authenticateAdmin, deletePlan);

// Plan Offers
router.get('/plan-offers', getPlanOffers);
router.get('/plan-offers/:id', getPlanOfferById);
router.post('/plan-offers', authenticateAdmin, createPlanOffer);
router.put('/plan-offers/:id', authenticateAdmin, updatePlanOffer);
router.delete('/plan-offers/:id', authenticateAdmin, deletePlanOffer);

// Plan Subscriptions (Admin)
router.get('/plan-subscriptions', authenticateAdmin, getPlanSubscriptions);

// Grocery Store Auth Routes
router.use('/store/auth', groceryStoreAuthRoutes);
// Fallback direct binding for OTP send in case nested auth router registration is stale.
router.post('/store/auth/send-otp', sendGroceryStoreOTP);
// Fallback direct binding for OTP verify in case nested auth router registration is stale.
router.post('/store/auth/verify-otp', verifyGroceryStoreOTP);

// Grocery Store Order Routes (authenticated)
router.use('/store', groceryStoreOrderRoutes);

// Grocery Store Product Routes (authenticated)
router.use('/store', groceryStoreProductRoutes);

// Grocery Store Add-on Routes (authenticated)
router.post('/store/menu/addon', authenticate, attachStoreAsRestaurant, addStoreAddon);
router.get('/store/menu/addons', authenticate, attachStoreAsRestaurant, getStoreAddons);
router.put('/store/menu/addon/:id', authenticate, attachStoreAsRestaurant, updateStoreAddon);
router.delete('/store/menu/addon/:id', authenticate, attachStoreAsRestaurant, deleteStoreAddon);

// Grocery Store Category Request Routes (authenticated)
router.use('/store', groceryStoreCategoryRequestRoutes);

// Grocery Store Onboarding Routes (authenticated)
router.get('/store/onboarding', authenticate, getOnboarding);
router.put('/store/onboarding', authenticate, updateOnboarding);

// Grocery Store Profile Routes (authenticated)
router.put('/store/profile', authenticate, updateStoreProfile);
router.get('/store/owner/me', authenticate, async (req, res) => {
  const store = req.store;
  const storeResponse = store.toObject();
  delete storeResponse.password;
  return res.status(200).json({
    success: true,
    data: { store: storeResponse }
  });
});

// Grocery Store Notifications (authenticated)
router.get('/store/notifications', authenticate, getStoreNotifications);
router.delete('/store/notifications/:id', authenticate, deleteStoreNotification);
router.delete('/store/notifications', authenticate, clearStoreNotifications);

// Grocery Store Wallet (authenticated)
router.get('/store/wallet', authenticate, getWallet);
router.get('/store/wallet/transactions', authenticate, getWalletTransactions);
router.get('/store/wallet/stats', authenticate, getWalletStats);
router.post('/store/withdrawal/request', authenticate, createWithdrawalRequest);
router.get('/store/withdrawal/requests', authenticate, getWithdrawalRequests);

export default router;
