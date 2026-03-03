import jwtService from '../../auth/services/jwtService.js';
import GroceryStore, { hydrateGroceryStoreByIdFromLegacy } from '../models/GroceryStore.js';
import { errorResponse } from '../../../shared/utils/response.js';

/**
 * Store Authentication Middleware
 * Verifies JWT token and attaches store account to request.
 * `/store` should allow existing store/restaurant accounts to login.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'Authorization token is required');
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwtService.verifyAccessToken(token);
      
      let store = await GroceryStore.findById(decoded.userId);
      if (!store) {
        store = await hydrateGroceryStoreByIdFromLegacy(decoded.userId);
      }

      if (!store) {
        return errorResponse(res, 401, 'Store not found');
      }

      // Allow inactive stores to access onboarding and profile/auth status endpoints.
      // They must complete onboarding and check account state before admin approval.
      const requestPath = req.originalUrl || req.url || '';
      const reqPath = req.path || '';
      const baseUrl = req.baseUrl || '';
      const isOnboardingRoute =
        requestPath.includes('/onboarding') ||
        reqPath === '/onboarding' ||
        reqPath.includes('onboarding');
      const isProfileRoute =
        requestPath.includes('/auth/me') ||
        requestPath.includes('/owner/me') ||
        reqPath === '/me' ||
        reqPath === '/owner/me' ||
        (baseUrl.includes('/auth') && reqPath === '/me');
      const isReadRequest = req.method === 'GET';

      if (!store.isActive && !isOnboardingRoute && !isProfileRoute && !isReadRequest) {
        return errorResponse(res, 403, 'Grocery store account is not active');
      }

      req.store = store;
      next();
    } catch (tokenError) {
      if (tokenError.name === 'TokenExpiredError') {
        return errorResponse(res, 401, 'Token has expired');
      }
      return errorResponse(res, 401, 'Invalid token');
    }
  } catch (error) {
    return errorResponse(res, 500, 'Authentication error');
  }
};
