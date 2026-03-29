import Admin from '../models/Admin.js';
import jwtService from '../../auth/services/jwtService.js';
import otpService from '../../auth/services/otpService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const setAdminRefreshCookies = (res, token) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  // Keep legacy cookie + module-specific cookie to avoid cross-module collisions.
  res.cookie('refreshToken', token, cookieOptions);
  res.cookie('adminRefreshToken', token, cookieOptions);
};

const clearAdminRefreshCookies = (res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.clearCookie('refreshToken', cookieOptions);
  res.clearCookie('adminRefreshToken', cookieOptions);
};

/**
 * Admin Login
 * POST /api/admin/auth/login
 */
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return errorResponse(res, 400, 'Email and password are required');
  }

  // Find admin by email (including password for comparison)
  const admin = await Admin.findOne({ email: email.toLowerCase() })
    .select('+password')
    .populate('assignedZoneIds', 'name zoneName platform isActive');

  if (!admin) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  if (!admin.isActive) {
    return errorResponse(res, 401, 'Admin account is inactive. Please contact super admin.');
  }

  // Verify password
  const isPasswordValid = await admin.comparePassword(password);

  if (!isPasswordValid) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  // Update last login
  await admin.updateLastLogin();

  // Generate tokens
  const tokens = jwtService.generateTokens({
    userId: admin._id.toString(),
    role: 'admin',
    email: admin.email,
    adminRole: admin.role
  });

  setAdminRefreshCookies(res, tokens.refreshToken);

  // Remove password from response
  const adminResponse = admin.toObject();
  delete adminResponse.password;

  logger.info(`Admin logged in: ${admin._id}`, { email: admin.email });

  return successResponse(res, 200, 'Login successful', {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    admin: adminResponse
  });
});

/**
 * Get Current Admin
 * GET /api/admin/auth/me
 */
export const getCurrentAdmin = asyncHandler(async (req, res) => {
  try {
    // req.user should be set by admin authentication middleware
    const admin = await Admin.findById(req.user._id || req.user.userId)
      .select('-password')
      .populate('assignedZoneIds', 'name zoneName platform isActive')
      .lean();

    if (!admin) {
      return errorResponse(res, 404, 'Admin not found');
    }

    return successResponse(res, 200, 'Admin retrieved successfully', {
      admin
    });
  } catch (error) {
    logger.error(`Error fetching current admin: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch admin');
  }
});

/**
 * Logout Admin
 * POST /api/admin/auth/logout
 */
export const adminLogout = asyncHandler(async (req, res) => {
  clearAdminRefreshCookies(res);

  logger.info(`Admin logged out: ${req.user?._id || req.user?.userId}`);

  return successResponse(res, 200, 'Logout successful');
});

/**
 * Refresh Access Token
 * POST /api/admin/auth/refresh-token
 */
export const refreshAdminToken = asyncHandler(async (req, res) => {
  const refreshToken =
    req.cookies?.adminRefreshToken ||
    req.cookies?.refreshToken ||
    req.body?.refreshToken ||
    req.headers['x-refresh-token'];

  if (!refreshToken) {
    return errorResponse(res, 401, 'Refresh token not found');
  }

  try {
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    if (decoded.role !== 'admin') {
      return errorResponse(res, 401, 'Invalid token for admin');
    }

    const admin = await Admin.findById(decoded.userId).select('-password');
    if (!admin || !admin.isActive) {
      return errorResponse(res, 401, 'Admin not found or inactive');
    }

    const accessToken = jwtService.generateAccessToken({
      userId: admin._id.toString(),
      role: 'admin',
      email: admin.email,
      adminRole: admin.role
    });

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken
    });
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid refresh token');
  }
});

