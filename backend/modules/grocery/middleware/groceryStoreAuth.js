import jwtService from '../../auth/services/jwtService.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
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
      
      const store = await Restaurant.findById(decoded.userId);

      if (!store) {
        return errorResponse(res, 401, 'Store not found');
      }

      if (!store.isActive) {
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
