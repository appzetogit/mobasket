/**
 * API Client
 * Centralized API client for all modules (user, restaurant, delivery, admin)
 * 
 * Usage:
 * import api from '@/lib/api'
 * 
 * // GET request
 * const response = await api.get('/user/profile')
 * 
 * // POST request
 * const response = await api.post('/auth/login', { email, password })
 * 
 * // PUT request
 * const response = await api.put('/user/profile', { name, email })
 * 
 * // DELETE request
 * const response = await api.delete('/user/addresses/:id')
 */

import apiClient from './axios.js';
import { API_ENDPOINTS } from './config.js';

// Export the configured axios instance
export default apiClient;

// Export API endpoints for convenience
export { API_ENDPOINTS };

const getAdminPlatform = () => {
  if (typeof window === "undefined") return "mofood";
  try {
    return localStorage.getItem("adminPlatform") === "mogrocery" ? "mogrocery" : "mofood";
  } catch {
    return "mofood";
  }
};

// Export helper functions for common operations
export const api = {
  // GET request
  get: (url, config = {}) => {
    return apiClient.get(url, config);
  },

  // POST request
  post: (url, data = {}, config = {}) => {
    return apiClient.post(url, data, config);
  },

  // PUT request
  put: (url, data = {}, config = {}) => {
    return apiClient.put(url, data, config);
  },

  // PATCH request
  patch: (url, data = {}, config = {}) => {
    return apiClient.patch(url, data, config);
  },

  // DELETE request
  delete: (url, config = {}) => {
    return apiClient.delete(url, config);
  },
};

// Export auth helper functions
export const authAPI = {
  // Send OTP (supports both phone and email)
  sendOTP: (phone = null, purpose = 'login', email = null) => {
    const payload = { purpose };
    if (phone) payload.phone = phone;
    if (email) payload.email = email;
    return apiClient.post(API_ENDPOINTS.AUTH.SEND_OTP, payload);
  },

  // Verify OTP (supports both phone and email)
  // 'password' is used only for email/password registrations (e.g. admin signup)
  verifyOTP: (phone = null, otp, purpose = 'login', name = null, email = null, role = 'user', password = null) => {
    const payload = {
      otp,
      purpose,
      role,
    };
    if (phone != null) payload.phone = phone;
    if (email != null) payload.email = email;
    if (name != null) payload.name = name;
    if (password != null) payload.password = password; // don't send null, Joi expects string
    return apiClient.post(API_ENDPOINTS.AUTH.VERIFY_OTP, payload);
  },

  // Register with email/password
  register: (name, email, password, phone = null, role = 'user') => {
    return apiClient.post(API_ENDPOINTS.AUTH.REGISTER, {
      name,
      email,
      password,
      phone,
      role,
    });
  },

  // Login with email/password
  login: (email, password, role = null) => {
    const payload = { email, password };
    if (role) payload.role = role;
    return apiClient.post(API_ENDPOINTS.AUTH.LOGIN, payload);
  },

  // Login/Register via Firebase Google ID token
  firebaseGoogleLogin: (idToken, role = 'user') => {
    return apiClient.post(API_ENDPOINTS.AUTH.FIREBASE_GOOGLE_LOGIN, { idToken, role });
  },

  // Refresh token
  refreshToken: () => {
    return apiClient.post(API_ENDPOINTS.AUTH.REFRESH_TOKEN);
  },

  // Logout
  logout: () => {
    return apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
  },

  // Get current user
  getCurrentUser: () => {
    return apiClient.get(API_ENDPOINTS.AUTH.ME);
  },

  updateFcmToken: (token, platform) => {
    return apiClient.post(API_ENDPOINTS.AUTH.FCM_TOKEN, { token, platform });
  },
};

// Export user API helper functions
export const userAPI = {
  // Get user profile
  getProfile: () => {
    return apiClient.get(API_ENDPOINTS.USER.PROFILE);
  },

  // Update user profile
  updateProfile: (data) => {
    return apiClient.put(API_ENDPOINTS.USER.PROFILE, data);
  },

  // Mark app shared by user (used for shared-user coupons)
  markAppShared: () => {
    return apiClient.post('/user/profile/share-app');
  },

  // Upload profile image
  uploadProfileImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.post('/user/profile/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Get user addresses
  getAddresses: () => {
    return apiClient.get(API_ENDPOINTS.USER.ADDRESSES);
  },

  // Add address
  addAddress: (address) => {
    return apiClient.post(API_ENDPOINTS.USER.ADDRESSES, address);
  },

  // Update address
  updateAddress: (addressId, address) => {
    return apiClient.put(`${API_ENDPOINTS.USER.ADDRESSES}/${addressId}`, address);
  },

  // Delete address
  deleteAddress: (addressId) => {
    return apiClient.delete(`${API_ENDPOINTS.USER.ADDRESSES}/${addressId}`);
  },

  // Get user preferences
  getPreferences: () => {
    return apiClient.get(API_ENDPOINTS.USER.PREFERENCES);
  },

  // Update preferences
  updatePreferences: (preferences) => {
    return apiClient.put(API_ENDPOINTS.USER.PREFERENCES, preferences);
  },

  // Get wallet
  getWallet: () => {
    return apiClient.get(API_ENDPOINTS.USER.WALLET);
  },

  // Get wallet transactions
  getWalletTransactions: (params = {}) => {
    return apiClient.get(`${API_ENDPOINTS.USER.WALLET}/transactions`, { params });
  },

  // Create Razorpay order for wallet top-up
  createWalletTopupOrder: (amount) => {
    return apiClient.post(`${API_ENDPOINTS.USER.WALLET}/create-topup-order`, { amount });
  },

  // Verify payment and add money to wallet
  verifyWalletTopupPayment: (data) => {
    return apiClient.post(`${API_ENDPOINTS.USER.WALLET}/verify-topup-payment`, data);
  },

  // Add money to wallet (direct - internal use)
  addMoneyToWallet: (data) => {
    return apiClient.post(`${API_ENDPOINTS.USER.WALLET}/add-money`, data);
  },

  // Get user orders
  getOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.USER.ORDERS, { params });
  },

  // Get user location
  getLocation: () => {
    return apiClient.get(API_ENDPOINTS.USER.LOCATION);
  },

  // Update user location
  updateLocation: (locationData) => {
    return apiClient.put(API_ENDPOINTS.USER.LOCATION, locationData);
  },
};

// Export location API helper functions
export const locationAPI = {
  // Reverse geocode coordinates to address
  reverseGeocode: (lat, lng) => {
    return apiClient.get(API_ENDPOINTS.LOCATION.REVERSE_GEOCODE, {
      params: { lat, lng }
    });
  },
  // Get nearby locations
  getNearbyLocations: (lat, lng, radius = 500, query = '') => {
    return apiClient.get(API_ENDPOINTS.LOCATION.NEARBY, {
      params: { lat, lng, radius, query }
    });
  },
};

// Export zone API helper functions
export const zoneAPI = {
  // Detect user's zone based on location
  detectZone: (lat, lng, platform = "mofood") => {
    return apiClient.get(API_ENDPOINTS.ZONE.DETECT, {
      params: { lat, lng, platform }
    });
  },
  detectAllZones: (lat, lng, platform = "mofood") => {
    return apiClient.get(API_ENDPOINTS.ZONE.DETECT_ALL, {
      params: { lat, lng, platform }
    });
  },
  getActiveZones: (platform = "mofood") => {
    return apiClient.get(API_ENDPOINTS.ZONE.ACTIVE, {
      params: { platform }
    });
  },
};

// Export restaurant API helper functions
export const restaurantAPI = {
  // Restaurant Authentication
  sendOTP: (phone = null, purpose = 'login', email = null) => {
    const payload = { purpose };
    if (phone) payload.phone = phone;
    if (email) payload.email = email;
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.SEND_OTP, payload);
  },

  verifyOTP: (phone = null, otp, purpose = 'login', name = null, email = null, password = null, meta = {}) => {
    const payload = {
      otp,
      purpose,
    };
    if (phone != null) payload.phone = phone;
    if (email != null) payload.email = email;
    if (name != null) payload.name = name;
    if (password != null) payload.password = password;
    if (meta?.token != null) payload.token = meta.token;
    if (meta?.platform != null) payload.platform = meta.platform;
    if (meta?.fcmToken != null) payload.fcmToken = meta.fcmToken;
    if (meta?.fcmTokenWeb != null) payload.fcmTokenWeb = meta.fcmTokenWeb;
    if (meta?.fcmTokenMobile != null) payload.fcmTokenMobile = meta.fcmTokenMobile;
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.VERIFY_OTP, payload);
  },

  register: (name, email, password, phone = null, ownerName = null, ownerEmail = null, ownerPhone = null, meta = {}) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.REGISTER, {
      name,
      email,
      password,
      phone,
      ownerName,
      ownerEmail,
      ownerPhone,
      token: meta?.token,
      platform: meta?.platform,
      fcmToken: meta?.fcmToken,
      fcmTokenWeb: meta?.fcmTokenWeb,
      fcmTokenMobile: meta?.fcmTokenMobile,
    });
  },

  login: (email, password, meta = {}) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.LOGIN, {
      email,
      password,
      token: meta?.token,
      platform: meta?.platform,
      fcmToken: meta?.fcmToken,
      fcmTokenWeb: meta?.fcmTokenWeb,
      fcmTokenMobile: meta?.fcmTokenMobile,
    });
  },

  firebaseGoogleLogin: (idToken, meta = {}) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.FIREBASE_GOOGLE_LOGIN, {
      idToken,
      token: meta?.token,
      platform: meta?.platform,
      fcmToken: meta?.fcmToken,
      fcmTokenWeb: meta?.fcmTokenWeb,
      fcmTokenMobile: meta?.fcmTokenMobile,
    });
  },

  refreshToken: () => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.REFRESH_TOKEN);
  },

  logout: () => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.LOGOUT);
  },

  getCurrentRestaurant: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.AUTH.ME);
  },
  updateFcmToken: (token, platform) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.FCM_TOKEN, { token, platform });
  },

  reverify: () => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.REVERIFY);
  },

  resetPassword: (email, otp, newPassword) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.AUTH.RESET_PASSWORD, {
      email,
      otp,
      newPassword,
    });
  },

  // Get restaurant profile
  getProfile: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.PROFILE);
  },

  // Update restaurant profile
  updateProfile: (data) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.PROFILE, data);
  },

  // Delete restaurant account
  deleteAccount: () => {
    return apiClient.delete(API_ENDPOINTS.RESTAURANT.PROFILE);
  },

  // Update delivery status (isAcceptingOrders)
  updateDeliveryStatus: (isAcceptingOrders) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.DELIVERY_STATUS, { isAcceptingOrders });
  },

  // Outlet timings
  getOutletTimings: () => {
    return apiClient.get('/restaurant/outlet-timings');
  },
  upsertOutletTimings: (payload) => {
    return apiClient.put('/restaurant/outlet-timings', payload);
  },
  updateOutletDayTiming: (day, payload) => {
    return apiClient.patch(`/restaurant/outlet-timings/day/${day}`, payload);
  },

  // Upload profile image
  uploadProfileImage: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.PROFILE}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Upload menu image
  uploadMenuImage: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.PROFILE}/menu-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Staff Management
  addStaff: (data) => {
    // If data is FormData, set appropriate headers
    const config = data instanceof FormData
      ? {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
      : {};
    return apiClient.post(API_ENDPOINTS.RESTAURANT.STAFF, data, config);
  },
  getStaff: (role) => {
    const url = role ? `${API_ENDPOINTS.RESTAURANT.STAFF}?role=${role}` : API_ENDPOINTS.RESTAURANT.STAFF;
    return apiClient.get(url);
  },
  getStaffById: (id) => {
    return apiClient.get(`${API_ENDPOINTS.RESTAURANT.STAFF}/${id}`);
  },
  updateStaff: (id, data) => {
    return apiClient.put(`${API_ENDPOINTS.RESTAURANT.STAFF}/${id}`, data);
  },
  deleteStaff: (id) => {
    return apiClient.delete(`${API_ENDPOINTS.RESTAURANT.STAFF}/${id}`);
  },

  // Menu operations
  getMenu: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.MENU);
  },
  updateMenu: (menuData) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.MENU, menuData);
  },
  addSection: (name) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/section`, { name });
  },
  addItemToSection: (sectionId, item) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/section/item`, { sectionId, item });
  },
  addSubsectionToSection: (sectionId, name) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/section/subsection`, { sectionId, name });
  },
  addItemToSubsection: (sectionId, subsectionId, item) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/subsection/item`, { sectionId, subsectionId, item });
  },
  getMenuByRestaurantId: (restaurantId) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.MENU_BY_RESTAURANT_ID.replace(':id', restaurantId));
  },

  // Get orders
  getOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.ORDERS, { params });
  },

  // Get order by ID
  getOrderById: (id) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.ORDER_BY_ID.replace(':id', id));
  },

  // Accept order
  acceptOrder: (id, preparationTime = null) => {
    return apiClient.patch(
      API_ENDPOINTS.RESTAURANT.ORDER_ACCEPT.replace(':id', id),
      { preparationTime },
      { timeout: 120000 }
    );
  },

  // Reject order
  rejectOrder: (id, reason = '') => {
    return apiClient.patch(API_ENDPOINTS.RESTAURANT.ORDER_REJECT.replace(':id', id), {
      reason
    });
  },

  // Mark order as preparing
  markOrderPreparing: (id, options = {}) => {
    const url = API_ENDPOINTS.RESTAURANT.ORDER_PREPARING.replace(':id', id);
    // Add resend query parameter if provided
    if (options.resend) {
      return apiClient.patch(`${url}?resend=true`);
    }
    return apiClient.patch(url);
  },

  // Mark order as ready
  markOrderReady: (id) => {
    return apiClient.patch(API_ENDPOINTS.RESTAURANT.ORDER_READY.replace(':id', id));
  },

  // Resend delivery notification for unassigned order
  resendDeliveryNotification: (id) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.ORDER_RESEND_DELIVERY_NOTIFICATION.replace(':id', id));
  },

  // Get wallet
  getWallet: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.WALLET);
  },
  getWalletTransactions: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.WALLET_TRANSACTIONS, { params });
  },
  getWalletStats: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.WALLET_STATS, { params });
  },
  // Withdrawal
  createWithdrawalRequest: (amount) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.WITHDRAWAL_REQUEST, { amount });
  },
  getWithdrawalRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.WITHDRAWAL_REQUESTS, { params });
  },

  // Get analytics
  getAnalytics: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.ANALYTICS, { params });
  },

  // Get all restaurants (for user module)
  getRestaurants: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.LIST, { params });
  },

  // Get restaurants with dishes under ₹250
  getRestaurantsUnder250: (zoneId) => {
    const params = zoneId ? { zoneId } : {};
    return apiClient.get(API_ENDPOINTS.RESTAURANT.UNDER_250, { params });
  },

  // Get restaurant by ID or slug
  getRestaurantById: (id) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.BY_ID.replace(':id', id));
  },
  // Get coupons for item (public - for user cart)
  getCouponsByItemIdPublic: (restaurantId, itemId) => {
    return apiClient.get(
      API_ENDPOINTS.RESTAURANT.COUPONS_BY_ITEM_ID_PUBLIC
        .replace(':restaurantId', restaurantId)
        .replace(':itemId', itemId)
    );
  },
  // Get public offers (for user offers page)
  getPublicOffers: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.OFFERS_PUBLIC);
  },

  // Get restaurant by owner (for restaurant module)
  getRestaurantByOwner: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.BY_OWNER);
  },

  // Menu operations (for restaurant module)
  getMenu: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.MENU);
  },
  updateMenu: (menuData) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.MENU, menuData);
  },
  addSection: (name) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/section`, { name });
  },
  addItemToSection: (sectionId, item) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/section/item`, { sectionId, item });
  },
  addSubsectionToSection: (sectionId, name) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/section/subsection`, { sectionId, name });
  },
  addItemToSubsection: (sectionId, subsectionId, item) => {
    return apiClient.post(`${API_ENDPOINTS.RESTAURANT.MENU}/subsection/item`, { sectionId, subsectionId, item });
  },

  // Add-on operations
  addAddon: (addonData) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.ADDON, addonData);
  },
  getAddons: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.ADDONS);
  },
  updateAddon: (id, addonData) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.ADDON_BY_ID.replace(':id', id), addonData);
  },
  deleteAddon: (id) => {
    return apiClient.delete(API_ENDPOINTS.RESTAURANT.ADDON_BY_ID.replace(':id', id));
  },
  getAddonsByRestaurantId: (restaurantId, params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.ADDONS_BY_RESTAURANT_ID.replace(':id', restaurantId), {
      params,
    });
  },

  getMenuByRestaurantId: (restaurantId) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.MENU_BY_RESTAURANT_ID.replace(':id', restaurantId));
  },

  // Menu item scheduling operations
  scheduleItemAvailability: (scheduleData) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.MENU_ITEM_SCHEDULE, scheduleData);
  },
  cancelScheduledAvailability: (scheduleId) => {
    return apiClient.delete(API_ENDPOINTS.RESTAURANT.MENU_ITEM_SCHEDULE_BY_ID.replace(':scheduleId', scheduleId));
  },
  getItemSchedule: (sectionId, itemId) => {
    return apiClient.get(
      API_ENDPOINTS.RESTAURANT.MENU_ITEM_SCHEDULE_BY_ITEM
        .replace(':sectionId', sectionId)
        .replace(':itemId', itemId)
    );
  },

  // Category operations (for restaurant module)
  getCategories: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.CATEGORIES);
  },
  getAllCategories: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.CATEGORIES_ALL);
  },
  createCategory: (categoryData) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.CATEGORIES, categoryData);
  },
  updateCategory: (id, categoryData) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.CATEGORY_BY_ID.replace(':id', id), categoryData);
  },
  deleteCategory: (id) => {
    return apiClient.delete(API_ENDPOINTS.RESTAURANT.CATEGORY_BY_ID.replace(':id', id));
  },
  reorderCategories: (categories) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.CATEGORIES_REORDER, { categories });
  },

  // Inventory operations (for restaurant module)
  getInventory: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.INVENTORY);
  },
  updateInventory: (inventoryData) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.INVENTORY, inventoryData);
  },
  getInventoryByRestaurantId: (restaurantId) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.INVENTORY_BY_RESTAURANT_ID.replace(':id', restaurantId));
  },

  // Offer operations (for restaurant module)
  createOffer: (offerData) => {
    return apiClient.post(API_ENDPOINTS.RESTAURANT.OFFERS, offerData);
  },
  getOffers: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.OFFERS, { params });
  },
  getOfferById: (id) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.OFFER_BY_ID.replace(':id', id));
  },
  updateOfferStatus: (id, status) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.OFFER_STATUS.replace(':id', id), { status });
  },
  deleteOffer: (id) => {
    return apiClient.delete(API_ENDPOINTS.RESTAURANT.OFFER_BY_ID.replace(':id', id));
  },
  getCouponsByItemId: (itemId) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.COUPONS_BY_ITEM_ID.replace(':itemId', itemId));
  },

  // Finance operations (for restaurant module)
  getFinance: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.FINANCE, { params });
  },

  // Complaint operations
  getComplaints: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.COMPLAINTS, { params });
  },
  getComplaintById: (id) => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.COMPLAINT_BY_ID.replace(':id', id));
  },
  respondToComplaint: (id, response) => {
    return apiClient.put(API_ENDPOINTS.RESTAURANT.COMPLAINT_RESPOND.replace(':id', id), { response });
  },

  // Notifications
  getNotifications: () => {
    return apiClient.get(API_ENDPOINTS.RESTAURANT.NOTIFICATIONS);
  },
  deleteNotification: (id) => {
    return apiClient.delete(API_ENDPOINTS.RESTAURANT.NOTIFICATION_BY_ID.replace(':id', id));
  },
  clearNotifications: () => {
    return apiClient.delete(API_ENDPOINTS.RESTAURANT.NOTIFICATIONS);
  },
};

// Export grocery store API helper functions
export const groceryStoreAPI = {
  // Grocery Store Authentication
  sendOTP: (phone = null, purpose = 'login', email = null) => {
    const payload = { purpose };
    if (phone) payload.phone = phone;
    if (email) payload.email = email;
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.SEND_OTP, payload);
  },

  verifyOTP: (phone = null, otp, purpose = 'login', name = null, email = null, password = null, meta = {}) => {
    const payload = {
      otp: String(otp),
      purpose,
    };
    const hasPhone = phone != null && String(phone).trim() !== '';
    const hasEmail = email != null && String(email).trim() !== '';
    if (hasPhone) payload.phone = String(phone).trim();
    if (hasEmail) payload.email = String(email).trim();
    if (!payload.phone && !payload.email) {
      throw new Error('Either phone or email is required for verification');
    }
    if (name != null) payload.name = name;
    if (password != null) payload.password = password;
    if (meta?.token != null) payload.token = meta.token;
    if (meta?.platform != null) payload.platform = meta.platform;
    if (meta?.fcmToken != null) payload.fcmToken = meta.fcmToken;
    if (meta?.fcmTokenWeb != null) payload.fcmTokenWeb = meta.fcmTokenWeb;
    if (meta?.fcmTokenMobile != null) payload.fcmTokenMobile = meta.fcmTokenMobile;
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.VERIFY_OTP, payload);
  },

  register: (name, email, password, phone = null, ownerName = null, ownerEmail = null, ownerPhone = null, meta = {}) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.REGISTER, {
      name,
      email,
      password,
      phone,
      ownerName,
      ownerEmail,
      ownerPhone,
      token: meta?.token,
      platform: meta?.platform,
      fcmToken: meta?.fcmToken,
      fcmTokenWeb: meta?.fcmTokenWeb,
      fcmTokenMobile: meta?.fcmTokenMobile,
    });
  },

  login: (email, password, meta = {}) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.LOGIN, {
      email,
      password,
      token: meta?.token,
      platform: meta?.platform,
      fcmToken: meta?.fcmToken,
      fcmTokenWeb: meta?.fcmTokenWeb,
      fcmTokenMobile: meta?.fcmTokenMobile,
    });
  },

  firebaseGoogleLogin: (idToken, meta = {}) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.FIREBASE_GOOGLE_LOGIN, {
      idToken,
      token: meta?.token,
      platform: meta?.platform,
      fcmToken: meta?.fcmToken,
      fcmTokenWeb: meta?.fcmTokenWeb,
      fcmTokenMobile: meta?.fcmTokenMobile,
    });
  },

  refreshToken: () => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.REFRESH_TOKEN);
  },

  logout: () => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.LOGOUT);
  },

  getCurrentStore: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.AUTH.ME);
  },
  updateProfile: (data) => {
    return apiClient.put(API_ENDPOINTS.GROCERY_STORE.PROFILE, data);
  },
  updateDeliveryStatus: (isAcceptingOrders) => {
    return apiClient.put(API_ENDPOINTS.GROCERY_STORE.DELIVERY_STATUS, { isAcceptingOrders });
  },
  getOutletTimings: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.OUTLET_TIMINGS);
  },
  upsertOutletTimings: (payload) => {
    return apiClient.put(API_ENDPOINTS.GROCERY_STORE.OUTLET_TIMINGS, payload);
  },
  updateOutletDayTiming: (day, payload) => {
    return apiClient.patch(API_ENDPOINTS.GROCERY_STORE.OUTLET_TIMINGS_DAY.replace(':day', day), payload);
  },
  updateFcmToken: (token, platform) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.FCM_TOKEN, { token, platform });
  },

  reverify: () => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.AUTH.REVERIFY);
  },

  // Onboarding
  getOnboarding: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.ONBOARDING);
  },

  updateOnboarding: (onboardingData) => {
    return apiClient.put(API_ENDPOINTS.GROCERY_STORE.ONBOARDING, onboardingData);
  },

  // Profile
  getStoreByOwner: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.BY_OWNER);
  },

  // Orders
  getOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.ORDERS, { params });
  },

  getOrderById: (id) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.ORDER_BY_ID.replace(':id', id));
  },

  acceptOrder: (id, preparationTime = null) => {
    return apiClient.patch(
      API_ENDPOINTS.GROCERY_STORE.ORDER_ACCEPT.replace(':id', id),
      { preparationTime },
      { timeout: 120000 }
    );
  },

  rejectOrder: (id, reason = '') => {
    return apiClient.patch(API_ENDPOINTS.GROCERY_STORE.ORDER_REJECT.replace(':id', id), {
      reason
    });
  },

  markOrderPreparing: (id) => {
    return apiClient.patch(API_ENDPOINTS.GROCERY_STORE.ORDER_PREPARING.replace(':id', id));
  },

  markOrderReady: (id) => {
    return apiClient.patch(API_ENDPOINTS.GROCERY_STORE.ORDER_READY.replace(':id', id));
  },

  resendDeliveryNotification: (id) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.ORDER_RESEND_DELIVERY_NOTIFICATION.replace(':id', id));
  },

  // Notifications
  getNotifications: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.NOTIFICATIONS);
  },
  deleteNotification: (id) => {
    return apiClient.delete(API_ENDPOINTS.GROCERY_STORE.NOTIFICATION_BY_ID.replace(':id', id));
  },
  clearNotifications: () => {
    return apiClient.delete(API_ENDPOINTS.GROCERY_STORE.NOTIFICATIONS);
  },

  // Wallet
  getWallet: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.WALLET);
  },
  getWalletTransactions: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.WALLET_TRANSACTIONS, { params });
  },
  getWalletStats: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.WALLET_STATS, { params });
  },
  createWithdrawalRequest: (amount) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.WITHDRAWAL_REQUEST, { amount });
  },
  getWithdrawalRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.WITHDRAWAL_REQUESTS, { params });
  },

  // Products
  getProducts: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.PRODUCTS, { params });
  },

  getProductById: (id) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.PRODUCT_BY_ID.replace(':id', id));
  },

  updateProductStock: (id, stockData) => {
    return apiClient.patch(API_ENDPOINTS.GROCERY_STORE.PRODUCT_UPDATE_STOCK.replace(':id', id), stockData);
  },

  createProduct: (productData) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.PRODUCT_CREATE, productData);
  },

  updateProduct: (id, productData) => {
    return apiClient.put(API_ENDPOINTS.GROCERY_STORE.PRODUCT_UPDATE.replace(':id', id), productData);
  },

  deleteProduct: (id) => {
    return apiClient.delete(API_ENDPOINTS.GROCERY_STORE.PRODUCT_DELETE.replace(':id', id));
  },

  // Add-ons
  addAddon: (addonData) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.ADDON, addonData);
  },
  getAddons: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.ADDONS);
  },
  updateAddon: (id, addonData) => {
    return apiClient.put(API_ENDPOINTS.GROCERY_STORE.ADDON_BY_ID.replace(':id', id), addonData);
  },
  deleteAddon: (id) => {
    return apiClient.delete(API_ENDPOINTS.GROCERY_STORE.ADDON_BY_ID.replace(':id', id));
  },

  // Public grocery catalog (categories/subcategories) – no auth required
  getCategories: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.CATEGORIES, {
      params: { activeOnly: 'false', ...params },
    });
  },
  getSubcategories: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.SUBCATEGORIES, {
      params: { activeOnly: 'false', ...params },
    });
  },

  createCategoryRequest: (data) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.CATEGORY_REQUEST_CREATE, data);
  },
  getCategoryRequests: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.CATEGORY_REQUESTS);
  },
  createSubcategoryRequest: (data) => {
    return apiClient.post(API_ENDPOINTS.GROCERY_STORE.SUBCATEGORY_REQUEST_CREATE, data);
  },
  getSubcategoryRequests: () => {
    return apiClient.get(API_ENDPOINTS.GROCERY_STORE.SUBCATEGORY_REQUESTS);
  },
};

// Export delivery API helper functions
export const deliveryAPI = {
  // Delivery Authentication
  sendOTP: (phone, purpose = 'login') => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.AUTH.SEND_OTP, { phone, purpose });
  },
  verifyOTP: (phone, otp, purpose = 'login', name = null, meta = {}) => {
    const payload = { phone, otp, purpose };
    // Only include name if it's provided and is a string
    if (name && typeof name === 'string' && name.trim()) {
      payload.name = name.trim();
    }
    if (meta?.token != null) payload.token = meta.token;
    if (meta?.platform != null) payload.platform = meta.platform;
    if (meta?.fcmToken != null) payload.fcmToken = meta.fcmToken;
    if (meta?.fcmTokenWeb != null) payload.fcmTokenWeb = meta.fcmTokenWeb;
    if (meta?.fcmTokenMobile != null) payload.fcmTokenMobile = meta.fcmTokenMobile;
    return apiClient.post(API_ENDPOINTS.DELIVERY.AUTH.VERIFY_OTP, payload);
  },
  refreshToken: () => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.AUTH.REFRESH_TOKEN);
  },
  logout: () => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.AUTH.LOGOUT);
  },
  getCurrentDelivery: () => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.AUTH.ME);
  },
  updateFcmToken: (token, platform) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.AUTH.FCM_TOKEN, { token, platform });
  },

  // Dashboard
  getDashboard: () => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.DASHBOARD);
  },

  // Wallet
  getWallet: () => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.WALLET);
  },
  getWalletBalance: () => {
    // Backward compatibility - use getWallet instead
    return apiClient.get(API_ENDPOINTS.DELIVERY.WALLET);
  },
  getWalletTransactions: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.WALLET_TRANSACTIONS, { params });
  },
  getWalletStats: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.WALLET_STATS, { params });
  },
  createWithdrawalRequest: (data) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.WALLET_WITHDRAW, data);
  },
  addEarning: (data) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.WALLET_EARNINGS, data);
  },
  collectPayment: (data) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.WALLET_COLLECT_PAYMENT, data);
  },
  claimJoiningBonus: () => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.CLAIM_JOINING_BONUS);
  },
  createDepositOrder: (amount) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.WALLET_DEPOSIT_CREATE_ORDER, { amount });
  },
  verifyDepositPayment: (data) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.WALLET_DEPOSIT_VERIFY, data);
  },
  getOrderStats: (period = 'all') => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.ORDER_STATS, { params: { period } });
  },

  // Get emergency help numbers
  getEmergencyHelp: () => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.EMERGENCY_HELP);
  },

  // Support Tickets
  getSupportTickets: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.SUPPORT_TICKETS, { params });
  },

  getSupportTicketById: (id) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.SUPPORT_TICKET_BY_ID.replace(':id', id));
  },

  createSupportTicket: (data) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.SUPPORT_TICKETS, data);
  },

  // Get delivery profile
  getProfile: () => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.PROFILE);
  },

  // Update delivery profile
  updateProfile: (data) => {
    return apiClient.put(API_ENDPOINTS.DELIVERY.PROFILE, data);
  },

  // Get orders
  getOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.ORDERS, { params });
  },
  getOrderDetails: (orderId) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.ORDER_BY_ID.replace(':orderId', orderId));
  },
  acceptOrder: (orderId, currentLocation = {}) => {
    const payload = {};
    if (currentLocation.lat !== undefined && currentLocation.lat !== null) {
      payload.currentLat = currentLocation.lat;
    }
    if (currentLocation.lng !== undefined && currentLocation.lng !== null) {
      payload.currentLng = currentLocation.lng;
    }
    return apiClient.patch(API_ENDPOINTS.DELIVERY.ORDER_ACCEPT.replace(':orderId', orderId), payload);
  },
  rejectOrder: (orderId, reason = '') => {
    return apiClient.patch(API_ENDPOINTS.DELIVERY.ORDER_REJECT.replace(':orderId', orderId), {
      reason
    });
  },
  confirmReachedPickup: (orderId, currentLocation = {}) => {
    const payload = {};
    if (currentLocation.lat !== undefined && currentLocation.lat !== null) {
      payload.currentLat = currentLocation.lat;
    }
    if (currentLocation.lng !== undefined && currentLocation.lng !== null) {
      payload.currentLng = currentLocation.lng;
    }
    return apiClient.patch(API_ENDPOINTS.DELIVERY.ORDER_REACHED_PICKUP.replace(':orderId', orderId), payload);
  },
  confirmOrderId: (orderId, confirmedOrderId, currentLocation = {}, additionalData = {}) => {
    return apiClient.patch(API_ENDPOINTS.DELIVERY.ORDER_CONFIRM_ID.replace(':orderId', orderId), {
      confirmedOrderId,
      currentLat: currentLocation.lat,
      currentLng: currentLocation.lng,
      ...additionalData
    });
  },
  confirmReachedDrop: (orderId) => {
    return apiClient.patch(API_ENDPOINTS.DELIVERY.ORDER_REACHED_DROP.replace(':orderId', orderId));
  },
  completeDelivery: (orderId, rating = null, review = '') => {
    return apiClient.patch(API_ENDPOINTS.DELIVERY.ORDER_COMPLETE_DELIVERY.replace(':orderId', orderId), {
      rating,
      review
    });
  },

  // Get trip history
  getTripHistory: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.TRIP_HISTORY, { params });
  },

  // Get earnings
  getEarnings: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.EARNINGS, { params });
  },

  // Get active earning addon offers
  getActiveEarningAddons: () => {
    const endpoint = API_ENDPOINTS.DELIVERY.EARNINGS_ACTIVE_OFFERS;
    if (import.meta.env.DEV) {
      console.log('📡 Fetching active earning addons from:', endpoint);
    }
    return apiClient.get(endpoint);
  },

  // Update location
  updateLocation: (latitude, longitude, isOnline = null) => {
    const payload = {
      latitude,
      longitude,
    };
    if (typeof isOnline === 'boolean') {
      payload.isOnline = isOnline;
    }
    return apiClient.post(API_ENDPOINTS.DELIVERY.LOCATION, payload);
  },

  // Update online status
  updateOnlineStatus: (isOnline) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.LOCATION, {
      isOnline,
    });
  },

  // Signup
  submitSignupDetails: (data) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.SIGNUP.DETAILS, data);
  },
  submitSignupDocuments: (data) => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.SIGNUP.DOCUMENTS, data);
  },

  // Reverify (resubmit for approval)
  reverify: () => {
    return apiClient.post(API_ENDPOINTS.DELIVERY.REVERIFY);
  },

  // Get zones within radius (for delivery boy to see nearby zones)
  getZonesInRadius: (latitude, longitude, radius = 70) => {
    return apiClient.get(API_ENDPOINTS.DELIVERY.ZONES_IN_RADIUS, {
      params: { latitude, longitude, radius }
    });
  },
};

// Export admin API helper functions
export const adminAPI = {
  // Admin Auth

  login: (email, password) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.AUTH.LOGIN, { email, password });
  },

  refreshToken: () => {
    return apiClient.post(API_ENDPOINTS.ADMIN.AUTH.REFRESH_TOKEN);
  },

  logout: () => {
    return apiClient.post(API_ENDPOINTS.ADMIN.AUTH.LOGOUT);
  },

  getCurrentAdmin: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.AUTH.ME);
  },

  // Admin Management (super admin)
  getAdmins: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ADMINS, { params });
  },
  getAdminById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ADMIN_BY_ID.replace(':id', id));
  },
  createAdmin: (payload) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.ADMINS, payload);
  },
  updateAdmin: (id, payload) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.ADMIN_BY_ID.replace(':id', id), payload);
  },
  deleteAdmin: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.ADMIN_BY_ID.replace(':id', id));
  },

  // Get admin profile
  getAdminProfile: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.PROFILE);
  },

  // Update admin profile
  updateAdminProfile: (profileData) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.PROFILE, profileData);
  },

  // Change admin password
  changePassword: (currentPassword, newPassword) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.CHANGE_PASSWORD, {
      currentPassword,
      newPassword
    });
  },

  // Get dashboard stats (platform-scoped)
  getDashboardStats: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DASHBOARD_STATS, {
      params: {
        ...params,
        platform: params.platform || getAdminPlatform(),
      },
    });
  },

  // Push notifications (admin -> app inbox)
  getPushNotifications: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.PUSH_NOTIFICATIONS);
  },
  createPushNotification: (payload) => {
    const image = payload?.image;
    const hasImageFile =
      image &&
      typeof FormData !== 'undefined' &&
      ((typeof File !== 'undefined' && image instanceof File) ||
       (typeof Blob !== 'undefined' && image instanceof Blob));

    if (hasImageFile) {
      const formData = new FormData();
      if (payload?.title != null) formData.append('title', String(payload.title));
      if (payload?.description != null) formData.append('description', String(payload.description));
      if (payload?.zone != null) formData.append('zone', String(payload.zone));
      if (payload?.sendTo != null) formData.append('sendTo', String(payload.sendTo));
      formData.append('platform', String(payload?.platform || getAdminPlatform()));
      formData.append('image', image);
      return apiClient.post(API_ENDPOINTS.ADMIN.PUSH_NOTIFICATIONS, formData);
    }

    return apiClient.post(API_ENDPOINTS.ADMIN.PUSH_NOTIFICATIONS, {
      ...payload,
      platform: payload?.platform || getAdminPlatform(),
    });
  },

  // Get users
  getUsers: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.USERS, { params });
  },

  // Get user by ID
  getUserById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.USER_BY_ID.replace(':id', id));
  },

  // Update user status
  updateUserStatus: (id, isActive) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.USER_STATUS.replace(':id', id), { isActive });
  },

  // Get restaurants
  getRestaurants: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANTS, { params });
  },
  getRestaurantMenu: (restaurantId) => {
    return apiClient.get(`/admin/restaurants/${restaurantId}/menu`);
  },
  addRestaurantMenuItem: (restaurantId, payload) => {
    return apiClient.post(`/admin/restaurants/${restaurantId}/menu/items`, payload);
  },
  updateRestaurantMenuItem: (restaurantId, itemId, payload) => {
    return apiClient.put(`/admin/restaurants/${restaurantId}/menu/items/${itemId}`, payload);
  },

  // Create restaurant
  createRestaurant: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.RESTAURANTS, data);
  },

  // Get restaurant by ID
  getRestaurantById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_BY_ID.replace(':id', id));
  },

  // Update restaurant details
  updateRestaurant: (id, data) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.RESTAURANT_BY_ID.replace(':id', id), data);
  },

  // Get restaurant/store analytics (platform-scoped)
  getRestaurantAnalytics: (restaurantId, params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_ANALYTICS.replace(':restaurantId', restaurantId), {
      params: {
        ...params,
        platform: params.platform || getAdminPlatform(),
      },
    });
  },

  // Update restaurant status
  updateRestaurantStatus: (id, isActive) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.RESTAURANT_STATUS.replace(':id', id), { isActive });
  },

  // Grocery Store Management (New Segregated Backend)
  getGroceryStores: (params = {}) => {
    return apiClient.get('/grocery/stores', { params });
  },

  createGroceryStore: (data) => {
    return apiClient.post('/grocery/stores', data);
  },

  getGroceryStoreById: (id) => {
    return apiClient.get(`/grocery/stores/${id}`);
  },

  updateGroceryStore: (id, data) => {
    return apiClient.put(`/grocery/stores/${id}`, data);
  },

  updateGroceryStoreStatus: (id, isActive) => {
    return apiClient.patch(`/grocery/stores/${id}/status`, { isActive });
  },

  deleteGroceryStore: (id) => {
    return apiClient.delete(`/grocery/stores/${id}`);
  },

  updateGroceryAddonCategories: (restaurantId, addonId, categoryIds = []) => {
    return apiClient.patch(
      `/admin/grocery-addons/${encodeURIComponent(restaurantId)}/${encodeURIComponent(addonId)}/categories`,
      { categoryIds }
    );
  },

  // Get restaurant join requests
  getRestaurantJoinRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_REQUESTS, { params });
  },

  // Approve restaurant
  approveRestaurant: (id) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.RESTAURANT_APPROVE.replace(':id', id));
  },

  // Reject restaurant
  rejectRestaurant: (id, reason) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.RESTAURANT_REJECT.replace(':id', id), { reason });
  },

  // Delete restaurant
  deleteRestaurant: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.RESTAURANT_DELETE.replace(':id', id));
  },

  deleteRestaurantAddon: (restaurantId, addonId) => {
    // Use exact IDs as they are (Express will handle URL encoding automatically)
    return apiClient.delete(
      API_ENDPOINTS.ADMIN.RESTAURANT_ADDON_DELETE
        .replace(':restaurantId', String(restaurantId))
        .replace(':addonId', String(addonId))
    );
  },

  // Grocery Store Join Requests
  getGroceryStoreJoinRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.GROCERY_STORE_REQUESTS, { params });
  },
  approveGroceryStore: (id) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.GROCERY_STORE_APPROVE.replace(':id', id));
  },
  rejectGroceryStore: (id, reason) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.GROCERY_STORE_REJECT.replace(':id', id), { reason });
  },

  // Get all offers (with restaurant and dish details)
  getAllOffers: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.OFFERS, {
      params: {
        ...params,
        platform: params.platform || getAdminPlatform(),
      },
    });
  },
  createOffer: (payload) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.OFFERS, {
      ...payload,
      platform: payload?.platform || getAdminPlatform(),
    });
  },
  updateOffer: (id, payload) => {
    return apiClient.put(`${API_ENDPOINTS.ADMIN.OFFERS}/${id}`, {
      ...payload,
      platform: payload?.platform || getAdminPlatform(),
    });
  },

  // Restaurant Commission Management
  getRestaurantCommissions: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION, { params });
  },

  getApprovedRestaurants: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION_APPROVED_RESTAURANTS, { params });
  },

  getRestaurantCommissionById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION_BY_ID.replace(':id', id));
  },

  getCommissionByRestaurantId: (restaurantId) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION_BY_RESTAURANT_ID.replace(':restaurantId', restaurantId));
  },

  createRestaurantCommission: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION, data);
  },

  updateRestaurantCommission: (id, data) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION_BY_ID.replace(':id', id), data);
  },

  deleteRestaurantCommission: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION_BY_ID.replace(':id', id));
  },

  toggleRestaurantCommissionStatus: (id) => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION_STATUS.replace(':id', id));
  },

  calculateRestaurantCommission: (restaurantId, orderAmount) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.RESTAURANT_COMMISSION_CALCULATE, {
      restaurantId,
      orderAmount
    });
  },

  // Restaurant Complaint Management
  getRestaurantComplaints: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_COMPLAINTS, { params });
  },
  getRestaurantComplaintById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.RESTAURANT_COMPLAINT_BY_ID.replace(':id', id));
  },
  updateRestaurantComplaintStatus: (id, status, adminResponse, internalNotes) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.RESTAURANT_COMPLAINT_STATUS.replace(':id', id), {
      status,
      adminResponse,
      internalNotes
    });
  },
  updateRestaurantComplaintNotes: (id, internalNotes) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.RESTAURANT_COMPLAINT_NOTES.replace(':id', id), {
      internalNotes
    });
  },

  // Get delivery partners
  getDelivery: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY, { params });
  },

  // Get delivery partner join requests
  getDeliveryPartnerJoinRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_PARTNERS_REQUESTS, { params });
  },

  // Get delivery partner by ID
  getDeliveryPartnerById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_BY_ID.replace(':id', id));
  },

  // Approve delivery partner
  approveDeliveryPartner: (id) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_APPROVE.replace(':id', id));
  },

  // Reject delivery partner
  rejectDeliveryPartner: (id, reason) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_REJECT.replace(':id', id), { reason });
  },

  // Reverify delivery partner
  reverifyDeliveryPartner: (id) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_REVERIFY.replace(':id', id));
  },

  // Get all delivery partners
  getDeliveryEarnings: (params = {}) => {
    return apiClient.get('/admin/delivery-partners/earnings', { params });
  },

  getDeliveryPartners: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_PARTNERS, { params });
  },

  // Update delivery partner status
  updateDeliveryPartnerStatus: (id, status, isActive = null) => {
    const payload = {};
    if (status) payload.status = status;
    if (isActive !== null) payload.isActive = isActive;
    return apiClient.patch(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_STATUS.replace(':id', id), payload);
  },

  // Delete delivery partner
  deleteDeliveryPartner: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_DELETE.replace(':id', id));
  },

  // Add bonus to delivery partner
  addDeliveryPartnerBonus: (deliveryPartnerId, amount, reference = '') => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_BONUS, {
      deliveryPartnerId,
      amount: parseFloat(amount),
      reference
    });
  },

  // Get bonus transactions
  getDeliveryPartnerBonusTransactions: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_BONUS_TRANSACTIONS, { params });
  },

  // Get orders
  getOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ORDERS, {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },
  deleteOrder: (orderId) => {
    return apiClient.delete(`${API_ENDPOINTS.ADMIN.ORDERS}/${encodeURIComponent(orderId)}`);
  },

  // Get orders searching for deliveryman
  getSearchingDeliverymanOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ORDERS_SEARCHING_DELIVERYMAN, { params });
  },

  // Get ongoing orders
  getOngoingOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ORDERS_ONGOING, { params });
  },

  // Get transaction report
  getTransactionReport: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ORDERS_TRANSACTION_REPORT, {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },

  // Get restaurant report
  getRestaurantReport: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ORDERS_RESTAURANT_REPORT, { params });
  },

  // Get refund requests
  getRefundRequests: (params = {}) => {
    return apiClient.get('/api/admin/refund-requests', { params });
  },

  // Process refund (supports both old and new endpoints)
  processRefund: (orderId, data = {}) => {
    // Backend accepts either MongoDB ObjectId (24 chars) or orderId string
    // Note: Don't include /api prefix - apiClient baseURL already includes it
    if (!orderId) {
      return Promise.reject(new Error('Order ID is required'));
    }
    // Use the working endpoint: /admin/refund-requests/:orderId/process
    // apiClient baseURL is already /api, so this becomes /api/admin/refund-requests/:orderId/process
    return apiClient.post(`/admin/refund-requests/${encodeURIComponent(orderId)}/process`, data);
  },

  // Withdrawal Request Management
  getWithdrawalRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.WITHDRAWAL_REQUESTS, { params });
  },
  getGroceryWithdrawalRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.GROCERY_WITHDRAWAL_REQUESTS, { params });
  },
  approveWithdrawalRequest: (id) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.WITHDRAWAL_APPROVE.replace(':id', id));
  },
  approveGroceryWithdrawalRequest: (id) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.GROCERY_WITHDRAWAL_APPROVE.replace(':id', id));
  },
  rejectWithdrawalRequest: (id, rejectionReason = '') => {
    return apiClient.post(API_ENDPOINTS.ADMIN.WITHDRAWAL_REJECT.replace(':id', id), { rejectionReason });
  },
  rejectGroceryWithdrawalRequest: (id, rejectionReason = '') => {
    return apiClient.post(API_ENDPOINTS.ADMIN.GROCERY_WITHDRAWAL_REJECT.replace(':id', id), { rejectionReason });
  },

  // Get customer wallet report
  getCustomerWalletReport: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.CUSTOMER_WALLET_REPORT, { params });
  },

  // Business Settings Management
  getBusinessSettings: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.BUSINESS_SETTINGS);
  },

  updateBusinessSettings: (data, files = {}) => {
    const formData = new FormData();

    // Add text fields
    Object.keys(data).forEach(key => {
      if (key !== 'logo' && key !== 'favicon') {
        formData.append(key, data[key]);
      }
    });

    // Add files
    if (files.logo) {
      formData.append('logo', files.logo);
    }
    if (files.favicon) {
      formData.append('favicon', files.favicon);
    }

    return apiClient.put(API_ENDPOINTS.ADMIN.BUSINESS_SETTINGS, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Get analytics
  getAnalytics: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ANALYTICS, { params });
  },

  // Category Management
  getCategories: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.CATEGORIES, { params });
  },

  // Get public categories (for user frontend)
  getPublicCategories: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.CATEGORIES_PUBLIC);
  },

  getCategoryById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.CATEGORY_BY_ID.replace(':id', id));
  },

  createCategory: (data) => {
    // Axios will automatically handle FormData headers (including boundary)
    // No need to manually set Content-Type for FormData
    return apiClient.post(API_ENDPOINTS.ADMIN.CATEGORIES, data);
  },

  updateCategory: (id, data) => {
    // Axios will automatically handle FormData headers (including boundary)
    // No need to manually set Content-Type for FormData
    return apiClient.put(API_ENDPOINTS.ADMIN.CATEGORY_BY_ID.replace(':id', id), data);
  },

  deleteCategory: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.CATEGORY_BY_ID.replace(':id', id));
  },

  toggleCategoryStatus: (id) => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.CATEGORY_STATUS.replace(':id', id));
  },

  updateCategoryPriority: (id, priority) => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.CATEGORY_PRIORITY.replace(':id', id), { priority });
  },

  // Grocery Category Management (separate from mofood categories)
  getGroceryCategories: (params = {}) => {
    return apiClient.get('/grocery/categories', {
      params: {
        ...params,
        activeOnly: 'false',
      },
    });
  },

  getGroceryCategoryById: (id) => {
    return apiClient.get(`/grocery/categories/${id}`);
  },

  createGroceryCategory: (data) => {
    if (data instanceof FormData) {
      const payload = {
        name: data.get('name') || '',
        section: data.get('type') || 'Grocery & Kitchen',
        isActive: String(data.get('status')) === 'true',
        image: typeof data.get('image') === 'string' ? data.get('image') : '',
      };
      return apiClient.post('/grocery/categories', payload);
    }
    return apiClient.post('/grocery/categories', data);
  },

  updateGroceryCategory: (id, data) => {
    if (data instanceof FormData) {
      const payload = {
        name: data.get('name') || '',
        section: data.get('type') || 'Grocery & Kitchen',
        isActive: String(data.get('status')) === 'true',
        image: typeof data.get('image') === 'string' ? data.get('image') : '',
      };
      return apiClient.put(`/grocery/categories/${id}`, payload);
    }
    return apiClient.put(`/grocery/categories/${id}`, data);
  },

  deleteGroceryCategory: (id) => {
    return apiClient.delete(`/grocery/categories/${id}`);
  },

  toggleGroceryCategoryStatus: (id, isActive) => {
    return apiClient.put(`/grocery/categories/${id}`, { isActive });
  },

  getGrocerySubcategories: (params = {}) => {
    return apiClient.get('/grocery/subcategories', {
      params: {
        ...params,
        activeOnly: 'false',
      },
    });
  },

  getGrocerySubcategoryById: (id) => {
    return apiClient.get(`/grocery/subcategories/${id}`);
  },

  createGrocerySubcategory: (payload) => {
    return apiClient.post('/grocery/subcategories', payload);
  },

  updateGrocerySubcategory: (id, payload) => {
    return apiClient.put(`/grocery/subcategories/${id}`, payload);
  },

  deleteGrocerySubcategory: (id) => {
    return apiClient.delete(`/grocery/subcategories/${id}`);
  },

  toggleGrocerySubcategoryStatus: (id, isActive) => {
    return apiClient.put(`/grocery/subcategories/${id}`, { isActive });
  },

  getGroceryProducts: (params = {}) => {
    return apiClient.get('/grocery/products', {
      params: {
        ...params,
        activeOnly: 'false',
      },
    });
  },

  getGroceryProductById: (id) => {
    return apiClient.get(`/grocery/products/${id}`);
  },

  createGroceryProduct: (payload) => {
    return apiClient.post('/grocery/products', payload);
  },

  updateGroceryProduct: (id, payload) => {
    return apiClient.put(`/grocery/products/${id}`, payload);
  },

  deleteGroceryProduct: (id) => {
    return apiClient.delete(`/grocery/products/${id}`);
  },

  toggleGroceryProductStatus: (id, isActive) => {
    return apiClient.put(`/grocery/products/${id}`, { isActive });
  },

  // Grocery Product Approval
  getPendingGroceryProducts: (params = {}) => {
    return apiClient.get('/admin/grocery/products/pending', { params });
  },

  approveGroceryProduct: (id) => {
    return apiClient.patch(`/admin/grocery/products/${id}/approve`);
  },

  rejectGroceryProduct: (id, reason = '') => {
    return apiClient.patch(`/admin/grocery/products/${id}/reject`, { reason });
  },

  bulkApproveGroceryProducts: (productIds) => {
    return apiClient.post('/admin/grocery/products/bulk-approve', { productIds });
  },

  getGroceryPlans: (params = {}) => {
    return apiClient.get('/grocery/plans', {
      params: {
        ...params,
        activeOnly: 'false',
      },
    });
  },

  getGroceryPlanById: (id) => {
    return apiClient.get(`/grocery/plans/${id}`);
  },

  createGroceryPlan: (payload) => {
    return apiClient.post('/grocery/plans', payload);
  },

  updateGroceryPlan: (id, payload) => {
    return apiClient.put(`/grocery/plans/${id}`, payload);
  },

  deleteGroceryPlan: (id) => {
    return apiClient.delete(`/grocery/plans/${id}`);
  },

  toggleGroceryPlanStatus: (id, isActive) => {
    return apiClient.put(`/grocery/plans/${id}`, { isActive });
  },

  getGroceryPlanOffers: (params = {}) => {
    return apiClient.get('/grocery/plan-offers', {
      params: {
        ...params,
        activeOnly: 'false',
      },
    });
  },

  getGroceryPlanOfferById: (id) => {
    return apiClient.get(`/grocery/plan-offers/${id}`);
  },

  createGroceryPlanOffer: (payload) => {
    return apiClient.post('/grocery/plan-offers', payload);
  },

  updateGroceryPlanOffer: (id, payload) => {
    return apiClient.put(`/grocery/plan-offers/${id}`, payload);
  },

  deleteGroceryPlanOffer: (id) => {
    return apiClient.delete(`/grocery/plan-offers/${id}`);
  },

  getGroceryPlanSubscriptions: (params = {}) => {
    return apiClient.get('/grocery/plan-subscriptions', { params });
  },

  // Fee Settings Management (Delivery & Platform Fee)
  getFeeSettings: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.FEE_SETTINGS, {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },

  getPublicFeeSettings: (platform = null) => {
    const resolvedPlatform = platform || (typeof window !== "undefined" ? (window.location.pathname.includes("/grocery") ? "mogrocery" : "mofood") : "mofood");
    return apiClient.get(API_ENDPOINTS.ADMIN.FEE_SETTINGS_PUBLIC, {
      params: { platform: resolvedPlatform }
    });
  },

  getFeeSettingsHistory: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.FEE_SETTINGS_HISTORY, {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },

  createOrUpdateFeeSettings: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.FEE_SETTINGS, {
      ...data,
      platform: data?.platform || getAdminPlatform()
    });
  },

  updateFeeSettings: (id, data, params = {}) => {
    return apiClient.put(
      API_ENDPOINTS.ADMIN.FEE_SETTINGS_BY_ID.replace(':id', id),
      {
        ...data,
        platform: data?.platform || params.platform || getAdminPlatform()
      },
      { params: { ...params, platform: params.platform || getAdminPlatform() } }
    );
  },

  // Zone Management
  getZones: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ZONES, {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },

  getZoneById: (id, params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ZONE_BY_ID.replace(':id', id), {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },

  createZone: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.ZONES, {
      ...data,
      platform: data?.platform || getAdminPlatform()
    });
  },

  updateZone: (id, data, params = {}) => {
    return apiClient.put(
      API_ENDPOINTS.ADMIN.ZONE_BY_ID.replace(':id', id),
      {
        ...data,
        platform: data?.platform || params.platform || getAdminPlatform()
      },
      { params: { ...params, platform: params.platform || getAdminPlatform() } }
    );
  },

  deleteZone: (id, params = {}) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.ZONE_BY_ID.replace(':id', id), {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },

  toggleZoneStatus: (id, params = {}) => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.ZONE_STATUS.replace(':id', id), null, {
      params: { ...params, platform: params.platform || getAdminPlatform() }
    });
  },

  // Earning Addon Management
  createEarningAddon: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.EARNING_ADDON, data);
  },

  getEarningAddons: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.EARNING_ADDON, { params });
  },

  getEarningAddonById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.EARNING_ADDON_BY_ID.replace(':id', id));
  },

  updateEarningAddon: (id, data) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.EARNING_ADDON_BY_ID.replace(':id', id), data);
  },

  deleteEarningAddon: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.EARNING_ADDON_BY_ID.replace(':id', id));
  },

  toggleEarningAddonStatus: (id, status) => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.EARNING_ADDON_STATUS.replace(':id', id), { status });
  },

  checkEarningAddonCompletions: (deliveryPartnerId, debug = false) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.EARNING_ADDON_CHECK_COMPLETIONS, { deliveryPartnerId, debug });
  },

  // Earning Addon History Management
  getEarningAddonHistory: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.EARNING_ADDON_HISTORY, { params });
  },

  getEarningAddonHistoryById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.EARNING_ADDON_HISTORY_BY_ID.replace(':id', id));
  },

  creditEarningToWallet: (id, notes = '') => {
    return apiClient.post(API_ENDPOINTS.ADMIN.EARNING_ADDON_HISTORY_CREDIT.replace(':id', id), { notes });
  },

  cancelEarningAddonHistory: (id, reason = '') => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.EARNING_ADDON_HISTORY_CANCEL.replace(':id', id), { reason });
  },

  getEarningAddonHistoryStatistics: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.EARNING_ADDON_HISTORY_STATISTICS, { params });
  },

  // Environment Variables Management
  getEnvVariables: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.ENV_VARIABLES);
  },

  saveEnvVariables: (envData) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.ENV_VARIABLES, envData);
  },

  // Public Environment Variables (for frontend use)
  getPublicEnvVariables: () => {
    return apiClient.get('/env/public');
  },

  // Delivery Boy Commission Management
  getCommissionRules: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_BOY_COMMISSION, { params });
  },

  getCommissionRuleById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_BOY_COMMISSION_BY_ID.replace(':id', id));
  },

  createCommissionRule: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_BOY_COMMISSION, data);
  },

  updateCommissionRule: (id, data) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.DELIVERY_BOY_COMMISSION_BY_ID.replace(':id', id), data);
  },

  deleteCommissionRule: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.DELIVERY_BOY_COMMISSION_BY_ID.replace(':id', id));
  },

  toggleCommissionRuleStatus: (id, status) => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.DELIVERY_BOY_COMMISSION_STATUS.replace(':id', id), { status });
  },

  calculateCommission: (distance) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_BOY_COMMISSION_CALCULATE, { distance });
  },

  // Delivery Partner global cash limit
  getDeliveryCashLimit: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_CASH_LIMIT);
  },

  updateDeliveryCashLimit: (data) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.DELIVERY_CASH_LIMIT, typeof data === 'object' ? data : { deliveryCashLimit: data });
  },

  // Deliveryman Reviews
  getDeliverymanReviews: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_PARTNER_REVIEWS, { params });
  },

  getCashLimitSettlements: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.CASH_LIMIT_SETTLEMENT, { params });
  },

  getDeliveryWithdrawalRequests: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_WITHDRAWAL_REQUESTS, { params });
  },
  approveDeliveryWithdrawal: (id) => {
    const sid = id != null ? String(id) : '';
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_WITHDRAWAL_APPROVE.replace(':id', sid));
  },
  rejectDeliveryWithdrawal: (id, rejectionReason = '') => {
    const sid = id != null ? String(id) : '';
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_WITHDRAWAL_REJECT.replace(':id', sid), { rejectionReason });
  },

  getDeliveryBoyWallets: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_BOY_WALLET, { params });
  },
  addDeliveryBoyWalletAdjustment: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_BOY_WALLET_ADJUSTMENT, data);
  },

  // Delivery Emergency Help Management
  getEmergencyHelp: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_EMERGENCY_HELP);
  },

  createOrUpdateEmergencyHelp: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.DELIVERY_EMERGENCY_HELP, data);
  },

  toggleEmergencyHelpStatus: () => {
    return apiClient.patch(API_ENDPOINTS.ADMIN.DELIVERY_EMERGENCY_HELP_STATUS);
  },

  // Delivery Support Tickets Management
  getDeliverySupportTickets: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_SUPPORT_TICKETS, { params });
  },

  getDeliverySupportTicketById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_SUPPORT_TICKET_BY_ID.replace(':id', id));
  },

  updateDeliverySupportTicket: (id, data) => {
    return apiClient.put(API_ENDPOINTS.ADMIN.DELIVERY_SUPPORT_TICKET_BY_ID.replace(':id', id), data);
  },

  getDeliverySupportTicketStats: () => {
    return apiClient.get(API_ENDPOINTS.ADMIN.DELIVERY_SUPPORT_TICKETS_STATS);
  },

  // Food Approval
  getPendingFoodApprovals: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.FOOD_APPROVALS, { params });
  },

  approveFoodItem: (id) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.FOOD_APPROVAL_APPROVE.replace(':id', id));
  },

  rejectFoodItem: (id, reason) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.FOOD_APPROVAL_REJECT.replace(':id', id), { reason });
  },

  approveOrderRequest: (id) => {
    return apiClient.post(`/admin/orders/${id}/approve`);
  },

  rejectOrderRequest: (id, reason) => {
    return apiClient.post(`/admin/orders/${id}/reject`, { reason });
  },

  resendOrderRiderNotification: (id) => {
    return apiClient.post(`/admin/orders/${id}/resend-rider-notification`);
  },

  getOrderRiderAssignmentDetails: (id) => {
    return apiClient.get(`/admin/orders/${id}/rider-assignment`);
  },

  // Grocery Approval Management
  getPendingGroceryApprovals: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.GROCERY_APPROVALS, { params });
  },

  approveGroceryItem: (id, payload = {}) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.GROCERY_APPROVAL_APPROVE.replace(':id', id), payload);
  },

  rejectGroceryItem: (id, reason, payload = {}) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.GROCERY_APPROVAL_REJECT.replace(':id', id), { reason, ...payload });
  },

  // Feedback Experience Management
  createFeedbackExperience: (data) => {
    return apiClient.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE, data);
  },

  getFeedbackExperiences: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE, { params });
  },

  getFeedbackExperienceById: (id) => {
    return apiClient.get(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_BY_ID.replace(':id', id));
  },

  deleteFeedbackExperience: (id) => {
    return apiClient.delete(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_BY_ID.replace(':id', id));
  },
};

// Upload / media helper functions
export const uploadAPI = {
  /**
   * Upload a single image/video file to Cloudinary via backend
   * @param {File} file - Browser File object
   * @param {Object} options - Optional { folder }
   */
  uploadMedia: (file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.folder) {
      formData.append('folder', options.folder);
    }

    return apiClient.post(API_ENDPOINTS.UPLOAD.MEDIA, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

// Export order API helper functions
export const orderAPI = {
  // Calculate order pricing
  calculateOrder: (orderData) => {
    return apiClient.post(API_ENDPOINTS.ORDER.CALCULATE, orderData);
  },

  // Create order and get Razorpay order
  createOrder: (orderData) => {
    return apiClient.post(API_ENDPOINTS.ORDER.CREATE, orderData);
  },

  // Verify payment
  verifyPayment: (paymentData) => {
    return apiClient.post(API_ENDPOINTS.ORDER.VERIFY_PAYMENT, paymentData);
  },

  // Get user orders
  getOrders: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.ORDER.LIST, { params });
  },

  // Complaint operations
  submitComplaint: (data) => {
    return apiClient.post(API_ENDPOINTS.USER.COMPLAINTS, data);
  },
  getUserComplaints: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.USER.COMPLAINTS, { params });
  },
  getComplaintDetails: (id) => {
    return apiClient.get(API_ENDPOINTS.USER.COMPLAINT_BY_ID.replace(':id', id));
  },

  // Get order details
  getOrderDetails: (orderId) => {
    return apiClient.get(API_ENDPOINTS.ORDER.DETAILS.replace(':id', orderId));
  },

  // Cancel order
  cancelOrder: (orderId, reason) => {
    return apiClient.patch(API_ENDPOINTS.ORDER.CANCEL.replace(':id', orderId), { reason });
  },

  // Edit order cart during post-order modification window
  editOrderCart: (orderId, items) => {
    return apiClient.patch(API_ENDPOINTS.ORDER.EDIT_CART.replace(':id', orderId), { items });
  },

  // Verify additional Razorpay payment for edited order cart
  verifyEditedOrderCartPayment: (orderId, paymentData) => {
    return apiClient.post(
      API_ENDPOINTS.ORDER.VERIFY_EDIT_CART_PAYMENT.replace(':id', orderId),
      paymentData
    );
  },

  // Switch an unpaid online order to Cash on Delivery
  switchOrderToCash: (orderId) => {
    return apiClient.patch(API_ENDPOINTS.ORDER.SWITCH_TO_COD.replace(':id', orderId));
  },
};

// Export dining API helper functions
export const diningAPI = {
  // Get dining restaurants (with optional filters)
  getRestaurants: (params = {}) => {
    return apiClient.get(API_ENDPOINTS.DINING.RESTAURANTS, { params });
  },

  // Get restaurant by slug
  getRestaurantBySlug: (slug) => {
    return apiClient.get(API_ENDPOINTS.DINING.RESTAURANT_BY_SLUG.replace(':slug', slug));
  },

  // Get dining categories
  getCategories: () => {
    return apiClient.get(API_ENDPOINTS.DINING.CATEGORIES);
  },

  // Get limelight features
  getLimelight: () => {
    return apiClient.get(API_ENDPOINTS.DINING.LIMELIGHT);
  },

  // Get bank offers
  getBankOffers: () => {
    return apiClient.get(API_ENDPOINTS.DINING.BANK_OFFERS);
  },

  // Get must tries
  getMustTries: () => {
    return apiClient.get(API_ENDPOINTS.DINING.MUST_TRIES);
  },

  // Get offer banners (used as limelight in Dining.jsx)
  getOfferBanners: () => {
    return apiClient.get(API_ENDPOINTS.DINING.OFFER_BANNERS);
  },

  // Get dining stories
  getStories: () => {
    return apiClient.get(API_ENDPOINTS.DINING.STORIES);
  },
};

// Export hero banner API helper functions
export const heroBannerAPI = {
  // Get Top 10 restaurants (public)
  getTop10Restaurants: () => {
    return apiClient.get(API_ENDPOINTS.HERO_BANNER.TOP_10_PUBLIC);
  },

  // Get Gourmet restaurants (public)
  getGourmetRestaurants: () => {
    return apiClient.get(API_ENDPOINTS.HERO_BANNER.GOURMET_PUBLIC);
  },
};
