import Restaurant from '../models/Restaurant.js';
import OutletTimings from '../models/OutletTimings.js';
import otpService from '../../auth/services/otpService.js';
import jwtService, { refreshCookieMaxAgeMs } from '../../auth/services/jwtService.js';
import firebaseAuthService from '../../auth/services/firebaseAuthService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import { isOpenFromOutletTimings } from '../utils/outletTimingStatus.js';
import winston from 'winston';

/**
 * Build auth phone query that searches the primary login phone field.
 */
const buildPhoneQuery = (normalizedPhone) => {
  if (!normalizedPhone) return null;

  const buildPhoneFieldOr = (phoneValue) => ([{ phone: phoneValue }]);

  // Check if normalized phone has country code (starts with 91 and is 12 digits)
  if (normalizedPhone.startsWith('91') && normalizedPhone.length === 12) {
    // Search for both: with country code and without country code
    const phoneWithoutCountryCode = normalizedPhone.substring(2);
    return {
      $or: [
        ...buildPhoneFieldOr(normalizedPhone),
        ...buildPhoneFieldOr(phoneWithoutCountryCode),
        ...buildPhoneFieldOr(`+${normalizedPhone}`),
        ...buildPhoneFieldOr(`+91${phoneWithoutCountryCode}`)
      ]
    };
  }

  // If it's already without country code, also check with country code
  return {
    $or: [
      ...buildPhoneFieldOr(normalizedPhone),
      ...buildPhoneFieldOr(`91${normalizedPhone}`),
      ...buildPhoneFieldOr(`+91${normalizedPhone}`),
      ...buildPhoneFieldOr(`+${normalizedPhone}`)
    ]
  };
};

/**
 * Legacy fallback query for outlets whose login number was saved only in
 * owner/contact fields before phone auth was standardized.
 * This should be used only after direct phone matching fails.
 */
const buildLegacyPhoneFallbackQuery = (normalizedPhone) => {
  if (!normalizedPhone) return null;

  const variants = new Set([normalizedPhone]);
  if (normalizedPhone.startsWith('91') && normalizedPhone.length === 12) {
    const withoutCountryCode = normalizedPhone.substring(2);
    variants.add(withoutCountryCode);
    variants.add(`+${normalizedPhone}`);
    variants.add(`+91${withoutCountryCode}`);
  } else {
    variants.add(`91${normalizedPhone}`);
    variants.add(`+91${normalizedPhone}`);
    variants.add(`+${normalizedPhone}`);
  }

  const legacyFields = ['ownerPhone', 'primaryContactNumber'];
  return {
    $or: [...variants].flatMap((phoneValue) => legacyFields.map((field) => ({ [field]: phoneValue })))
  };
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const RESTAURANT_PLATFORM_FILTER = { platform: { $ne: 'mogrocery' } };
const withRestaurantPlatformFilter = (query = {}) => ({
  ...query,
  ...RESTAURANT_PLATFORM_FILTER
});

const restaurantRefreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: refreshCookieMaxAgeMs
};

const restaurantClearCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict'
};

const setRestaurantRefreshCookies = (res, token) => {
  res.cookie('refreshToken', token, restaurantRefreshCookieOptions);
  res.cookie('restaurantRefreshToken', token, restaurantRefreshCookieOptions);
};

const clearRestaurantRefreshCookies = (res) => {
  res.clearCookie('refreshToken', restaurantClearCookieOptions);
  res.clearCookie('restaurantRefreshToken', restaurantClearCookieOptions);
};

const getFcmPatchFromBody = (body = {}) => {
  const patch = {};
  const normalizedPlatform = String(body?.platform || '').toLowerCase();
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const fcmToken = typeof body?.fcmToken === 'string' ? body.fcmToken.trim() : '';
  const fcmTokenWeb = typeof body?.fcmTokenWeb === 'string' ? body.fcmTokenWeb.trim() : '';
  const fcmTokenMobile = typeof body?.fcmTokenMobile === 'string' ? body.fcmTokenMobile.trim() : '';

  if (fcmTokenWeb) patch.fcmTokenWeb = fcmTokenWeb;
  if (fcmTokenMobile) patch.fcmTokenMobile = fcmTokenMobile;

  const fallbackToken = token || fcmToken;
  if (fallbackToken) {
    if (normalizedPlatform === 'web') patch.fcmTokenWeb = fallbackToken;
    if (normalizedPlatform === 'mobile') patch.fcmTokenMobile = fallbackToken;
  }

  return patch;
};

const getSafeOtpErrorMessage = (error) => {
  const rawMessage = String(error?.message || "");
  const isProviderOrTlsError =
    /ssl|tls|alert number|routines|socket hang up|econnreset|ehostunreach|etimedout|enotfound/i.test(rawMessage);
  const isGmailBadCredentials =
    /535|BadCredentials|Username and Password not accepted|gsmtp/i.test(rawMessage);

  if (isProviderOrTlsError) {
    return "OTP service is temporarily unavailable. Please try again in a few minutes.";
  }
  if (isGmailBadCredentials) {
    return "Email could not be sent: SMTP login failed. If using Gmail, use an App Password (not your regular password). Update SMTP_USER and SMTP_PASS in Admin > ENV Setup. See: https://support.google.com/accounts/answer/185833";
  }

  return rawMessage || "Failed to send OTP. Please try again.";
};

const getRequestedPlatform = (body = {}) => String(body?.platform || '').trim().toLowerCase();

const rejectIfGroceryPlatformRequest = (req, res) => {
  if (getRequestedPlatform(req?.body) !== 'mogrocery') return false;
  errorResponse(
    res,
    400,
    'Use grocery store auth endpoints for mogrocery accounts (/api/grocery/store/auth/*).'
  );
  return true;
};

/**
 * Send OTP for restaurant phone number or email
 * POST /api/restaurant/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req, res) => {
  if (rejectIfGroceryPlatformRequest(req, res)) return;
  const { phone, email, purpose = 'login' } = req.body;
  const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;

  // Validate that either phone or email is provided
  if (!phone && !email) {
    return errorResponse(res, 400, 'Either phone number or email is required');
  }

  // Validate phone number format if provided
  if (phone) {
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
    if (!phoneRegex.test(phone)) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }
    if (!normalizedPhone) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }
  }

  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 400, 'Invalid email format');
    }
  }

  try {
    const result = await otpService.generateAndSendOTP(normalizedPhone || null, purpose, email || null);
    return successResponse(res, 200, result.message, {
      expiresIn: result.expiresIn,
      identifierType: result.identifierType
    });
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    return errorResponse(res, 500, getSafeOtpErrorMessage(error));
  }
});

/**
 * Verify OTP and login/register restaurant
 * POST /api/restaurant/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  if (rejectIfGroceryPlatformRequest(req, res)) return;
  const { phone, email, otp, purpose = 'login', name, password } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  // Validate that either phone or email is provided
  if ((!phone && !email) || !otp) {
    return errorResponse(res, 400, 'Either phone number or email, and OTP are required');
  }

  try {
    let restaurant;
    // Normalize phone number if provided
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }

    const identifier = normalizedPhone || email;
    const identifierType = normalizedPhone ? 'phone' : 'email';

    if (purpose === 'register') {
      // Registration flow
      // Check if restaurant already exists with normalized phone
      // For phone, search in both formats (with and without country code) to handle old data
      if (normalizedPhone) {
        restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
      } else {
        restaurant = await Restaurant.findOne(
          withRestaurantPlatformFilter({ email: email?.toLowerCase().trim() })
        );
      }

      if (restaurant) {
        return errorResponse(res, 400, `Restaurant already exists with this ${identifierType}. Please login.`);
      }

      // Name is mandatory for explicit registration
      if (!name) {
        return errorResponse(res, 400, 'Restaurant name is required for registration');
      }

      // Verify OTP (phone or email) before creating restaurant
      await otpService.verifyOTP(normalizedPhone || null, otp, purpose, email || null);

      const restaurantData = {
        name,
        signupMethod: normalizedPhone ? 'phone' : 'email',
        ...fcmPatch
      };

      if (normalizedPhone) {
        restaurantData.phone = normalizedPhone;
        restaurantData.phoneVerified = true;
        restaurantData.ownerPhone = normalizedPhone;
        // For phone signup, set ownerEmail to empty string or phone-based email
        restaurantData.ownerEmail = email || `${normalizedPhone}@restaurant.mobasket.com`;
        // CRITICAL: Do NOT set email field for phone signups to avoid null duplicate key error
        // Email field should be completely omitted, not set to null or undefined
      }
      if (email) {
        restaurantData.email = email.toLowerCase().trim();
        restaurantData.ownerEmail = email.toLowerCase().trim();
      }
      // Ensure email is not set to null or undefined
      if (!email && !phone) {
        // This shouldn't happen due to validation, but just in case
        throw new Error('Either phone or email must be provided');
      }

      // If password provided (email/password registration), set it
      if (password && !phone) {
        restaurantData.password = password;
      }

      // Set owner name from restaurant name if not provided separately
      restaurantData.ownerName = name;

      // Set isActive to false - restaurant needs admin approval before becoming active
      restaurantData.isActive = false;

      try {
        // For phone signups, use $unset to ensure email field is not saved
        if (phone && !email) {
          // Use collection.insertOne directly to have full control over the document
          const docToInsert = { ...restaurantData };
          // Explicitly remove email field
          delete docToInsert.email;
          restaurant = await Restaurant.create(docToInsert);
        } else {
          restaurant = await Restaurant.create(restaurantData);
        }
        logger.info(`New restaurant registered: ${restaurant._id}`, {
          [identifierType]: identifier,
          restaurantId: restaurant._id
        });
      } catch (createError) {
        logger.error(`Error creating restaurant: ${createError.message}`, {
          code: createError.code,
          keyPattern: createError.keyPattern,
          phone,
          email,
          restaurantData: { ...restaurantData, password: '***' }
        });

        // Handle duplicate key error (email, phone, or slug)
        if (createError.code === 11000) {
          // Check if it's an email null duplicate key error (common with phone signups)
          if (createError.keyPattern && createError.keyPattern.email && phone && !email) {
            logger.warn(`Email null duplicate key error for phone signup: ${phone}`, {
              error: createError.message,
              keyPattern: createError.keyPattern
            });
            // Try to find existing restaurant by phone (search in both formats)
            restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
            if (restaurant) {
              return errorResponse(res, 400, `Restaurant already exists with this phone number. Please login.`);
            }
            // If not found, this is likely a database index issue - ensure email is completely removed
            // Create a fresh restaurantData object without email field
            const retryRestaurantData = {
              name: restaurantData.name,
              signupMethod: restaurantData.signupMethod,
              phone: restaurantData.phone,
              phoneVerified: restaurantData.phoneVerified,
              ownerPhone: restaurantData.ownerPhone,
              ownerEmail: restaurantData.ownerEmail,
              ownerName: restaurantData.ownerName,
              isActive: restaurantData.isActive
            };
            // Explicitly do NOT include email field
            if (restaurantData.password) {
              retryRestaurantData.password = restaurantData.password;
            }
            try {
              restaurant = await Restaurant.create(retryRestaurantData);
              logger.info(`New restaurant registered (fixed email null issue): ${restaurant._id}`, {
                [identifierType]: identifier,
                restaurantId: restaurant._id
              });
            } catch (retryError) {
              logger.error(`Failed to create restaurant after email null fix: ${retryError.message}`, {
                code: retryError.code,
                keyPattern: retryError.keyPattern,
                error: retryError
              });
              // Check if it's still a duplicate key error
              if (retryError.code === 11000) {
                // Try to find restaurant again (search in both formats)
                restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
                if (restaurant) {
                  return errorResponse(res, 400, `Restaurant already exists with this phone number. Please login.`);
                }
              }
              throw new Error(`Failed to create restaurant: ${retryError.message}. Please contact support.`);
            }
          } else if (createError.keyPattern && createError.keyPattern.phone) {
            // Phone duplicate key error - search in both formats
            restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
            if (restaurant) {
              return errorResponse(res, 400, `Restaurant already exists with this phone number. Please login.`);
            }
            throw new Error(`Phone number already exists: ${createError.message}`);
          } else if (createError.keyPattern && createError.keyPattern.slug) {
            // Check if it's a slug conflict
            // Retry with unique slug
            const baseSlug = restaurantData.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '');
            let counter = 1;
            let uniqueSlug = `${baseSlug}-${counter}`;
            while (await Restaurant.findOne(withRestaurantPlatformFilter({ slug: uniqueSlug }))) {
              counter++;
              uniqueSlug = `${baseSlug}-${counter}`;
            }
            restaurantData.slug = uniqueSlug;
            try {
              restaurant = await Restaurant.create(restaurantData);
              logger.info(`New restaurant registered with unique slug: ${restaurant._id}`, {
                [identifierType]: identifier,
                restaurantId: restaurant._id,
                slug: uniqueSlug
              });
            } catch (retryError) {
              // If still fails, check if restaurant exists
              if (normalizedPhone) {
                restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
              } else {
                restaurant = await Restaurant.findOne(
                  withRestaurantPlatformFilter({ email: email?.toLowerCase().trim() })
                );
              }
              if (!restaurant) {
                throw retryError;
              }
              return errorResponse(res, 400, `Restaurant already exists with this ${identifierType}. Please login.`);
            }
          } else {
            // Other duplicate key errors (email, phone)
            if (normalizedPhone) {
              restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
            } else {
              restaurant = await Restaurant.findOne(
                withRestaurantPlatformFilter({ email: email?.toLowerCase().trim() })
              );
            }
            if (!restaurant) {
              throw createError;
            }
            return errorResponse(res, 400, `Restaurant already exists with this ${identifierType}. Please login.`);
          }
        } else {
          throw createError;
        }
      }
    } else {
      // Login (with optional auto-registration)
      // For phone, search across all phone-bearing fields and common formats.
      if (normalizedPhone) {
        restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
      } else {
        restaurant = await Restaurant.findOne(
          withRestaurantPlatformFilter({ email: email?.toLowerCase().trim() })
        );
      }

      if (!restaurant && !name) {
        // Tell the client that we need restaurant name to proceed with auto-registration
        return successResponse(res, 200, 'Restaurant not found. Please provide restaurant name for registration.', {
          needsName: true,
          identifierType,
          identifier
        });
      }

      // Handle reset-password purpose
      if (purpose === 'reset-password') {
        if (!restaurant) {
          return errorResponse(res, 404, 'No restaurant account found with this email.');
        }
        // Verify OTP for password reset
        await otpService.verifyOTP(normalizedPhone || null, otp, purpose, email || null);
        return successResponse(res, 200, 'OTP verified. You can now reset your password.', {
          verified: true,
          email: restaurant.email
        });
      }

      // Verify OTP first
      await otpService.verifyOTP(normalizedPhone || null, otp, purpose, email || null);

      if (!restaurant) {
        // Auto-register new restaurant after OTP verification
        const restaurantData = {
          name,
          signupMethod: normalizedPhone ? 'phone' : 'email',
          ...fcmPatch
        };

        if (normalizedPhone) {
          restaurantData.phone = normalizedPhone;
          restaurantData.phoneVerified = true;
          restaurantData.ownerPhone = normalizedPhone;
          // For phone signup, set ownerEmail to empty string or phone-based email
          restaurantData.ownerEmail = email || `${normalizedPhone}@restaurant.mobasket.com`;
          // Explicitly don't set email field for phone signups to avoid null duplicate key error
        }
        if (email) {
          restaurantData.email = email.toLowerCase().trim();
          restaurantData.ownerEmail = email.toLowerCase().trim();
        }
        // Ensure email is not set to null or undefined
        if (!email && !phone) {
          // This shouldn't happen due to validation, but just in case
          throw new Error('Either phone or email must be provided');
        }

        if (password && !phone) {
          restaurantData.password = password;
        }

        restaurantData.ownerName = name;

        // Set isActive to false - restaurant needs admin approval before becoming active
        restaurantData.isActive = false;

        try {
          // For phone signups, ensure email field is not included
          if (phone && !email) {
            const docToInsert = { ...restaurantData };
            // Explicitly remove email field
            delete docToInsert.email;
            restaurant = await Restaurant.create(docToInsert);
          } else {
            restaurant = await Restaurant.create(restaurantData);
          }
          logger.info(`New restaurant auto-registered: ${restaurant._id}`, {
            [identifierType]: identifier,
            restaurantId: restaurant._id
          });
        } catch (createError) {
          logger.error(`Error creating restaurant (auto-register): ${createError.message}`, {
            code: createError.code,
            keyPattern: createError.keyPattern,
            phone,
            email,
            restaurantData: { ...restaurantData, password: '***' }
          });

          if (createError.code === 11000) {
            // Check if it's an email null duplicate key error (common with phone signups)
            if (createError.keyPattern && createError.keyPattern.email && phone && !email) {
              logger.warn(`Email null duplicate key error for phone signup: ${phone}`, {
                error: createError.message,
                keyPattern: createError.keyPattern
              });
              // Try to find existing restaurant by phone (search in both formats)
              restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
              if (restaurant) {
                logger.info(`Restaurant found after email null duplicate key error: ${restaurant._id}`);
                // Continue with login flow
              } else {
                // If not found, this is likely a database index issue - ensure email is completely removed
                // Create a fresh restaurantData object without email field
                const retryRestaurantData = {
                  name: restaurantData.name,
                  signupMethod: restaurantData.signupMethod,
                  phone: restaurantData.phone,
                  phoneVerified: restaurantData.phoneVerified,
                  ownerPhone: restaurantData.ownerPhone,
                  ownerEmail: restaurantData.ownerEmail,
                  ownerName: restaurantData.ownerName,
                  isActive: restaurantData.isActive
                };
                // Explicitly do NOT include email field
                if (restaurantData.password) {
                  retryRestaurantData.password = restaurantData.password;
                }
                try {
                  restaurant = await Restaurant.create(retryRestaurantData);
                  logger.info(`New restaurant auto-registered (fixed email null issue): ${restaurant._id}`, {
                    [identifierType]: identifier,
                    restaurantId: restaurant._id
                  });
                } catch (retryError) {
                  logger.error(`Failed to create restaurant after email null fix: ${retryError.message}`, {
                    code: retryError.code,
                    keyPattern: retryError.keyPattern,
                    error: retryError
                  });
                  // Check if it's still a duplicate key error
                  if (retryError.code === 11000) {
                    // Try to find restaurant again (search in both formats)
                    restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
                    if (restaurant) {
                      logger.info(`Restaurant found after retry error: ${restaurant._id}`);
                      // Continue with login flow
                    } else {
                      throw new Error(`Failed to create restaurant: ${retryError.message}. Please contact support.`);
                    }
                  } else {
                    throw new Error(`Failed to create restaurant: ${retryError.message}. Please contact support.`);
                  }
                }
              }
            } else if (createError.keyPattern && createError.keyPattern.phone) {
              // Phone duplicate key error
              restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
              if (restaurant) {
                logger.info(`Restaurant found after phone duplicate key error: ${restaurant._id}`);
                // Continue with login flow
              } else {
                throw new Error(`Phone number already exists: ${createError.message}`);
              }
            } else if (createError.keyPattern && createError.keyPattern.slug) {
              // Check if it's a slug conflict
              // Retry with unique slug
              const baseSlug = restaurantData.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
              let counter = 1;
              let uniqueSlug = `${baseSlug}-${counter}`;
              while (await Restaurant.findOne(withRestaurantPlatformFilter({ slug: uniqueSlug }))) {
                counter++;
                uniqueSlug = `${baseSlug}-${counter}`;
              }
              restaurantData.slug = uniqueSlug;
              try {
                restaurant = await Restaurant.create(restaurantData);
                logger.info(`New restaurant auto-registered with unique slug: ${restaurant._id}`, {
                  [identifierType]: identifier,
                  restaurantId: restaurant._id,
                  slug: uniqueSlug
                });
              } catch (retryError) {
                // If still fails, check if restaurant exists
                if (normalizedPhone) {
                  restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
                } else {
                  restaurant = await Restaurant.findOne(withRestaurantPlatformFilter({ email }));
                }
                if (!restaurant) {
                  throw retryError;
                }
                logger.info(`Restaurant found after duplicate key error: ${restaurant._id}`);
              }
            } else {
              // Other duplicate key errors (email, phone)
              if (normalizedPhone) {
                restaurant = await findRestaurantByNormalizedPhone(normalizedPhone);
              } else {
                restaurant = await Restaurant.findOne(withRestaurantPlatformFilter({ email }));
              }
              if (!restaurant) {
                throw createError;
              }
              logger.info(`Restaurant found after duplicate key error: ${restaurant._id}`);
            }
          } else {
            throw createError;
          }
        }
      } else {
        // Existing restaurant login - update verification status if needed
        let shouldSaveRestaurant = false;
        if (phone && !restaurant.phoneVerified) {
          restaurant.phoneVerified = true;
          shouldSaveRestaurant = true;
        }
        if (fcmPatch.fcmTokenWeb) {
          restaurant.fcmTokenWeb = fcmPatch.fcmTokenWeb;
          shouldSaveRestaurant = true;
        }
        if (fcmPatch.fcmTokenMobile) {
          restaurant.fcmTokenMobile = fcmPatch.fcmTokenMobile;
          shouldSaveRestaurant = true;
        }
        if (shouldSaveRestaurant) {
          await restaurant.save();
        }
      }
    }

    // Generate tokens (email may be null for phone signups)
    const tokens = jwtService.generateTokens({
      userId: restaurant._id.toString(),
      role: 'restaurant',
      email: restaurant.email || restaurant.phone || restaurant.restaurantId
    });

    // Set refresh token in httpOnly cookie
    setRestaurantRefreshCookies(res, tokens.refreshToken);

    // Check if onboarding needs to be completed (new accounts start with 'onboarding' status)
    const needsSignup = restaurant.status === 'onboarding';

    // Return access token and restaurant info
    return successResponse(res, 200, needsSignup ? 'OTP verified. Please complete your profile.' : 'Authentication successful', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      needsSignup,
      restaurant: serializeRestaurantAuthPayload(restaurant)
    });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    return errorResponse(res, 400, error.message);
  }
});

/**
 * Register restaurant with email and password
 * POST /api/restaurant/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  if (rejectIfGroceryPlatformRequest(req, res)) return;
  const { name, email, password, phone, ownerName, ownerEmail, ownerPhone } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  if (!name || !email || !password) {
    return errorResponse(res, 400, 'Restaurant name, email, and password are required');
  }

  // Normalize phone number if provided
  const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
  if (phone && !normalizedPhone) {
    return errorResponse(res, 400, 'Invalid phone number format');
  }

  // Check if restaurant already exists
  const existingQueryOr = [{ email: email.toLowerCase().trim() }];
  if (normalizedPhone) {
    const phoneQuery = buildPhoneQuery(normalizedPhone);
    if (phoneQuery?.$or?.length) {
      existingQueryOr.push(...phoneQuery.$or);
    } else {
      existingQueryOr.push({ phone: normalizedPhone });
    }
  }
  const existingRestaurant = await Restaurant.findOne(
    withRestaurantPlatformFilter({ $or: existingQueryOr })
  );

  if (existingRestaurant) {
    if (existingRestaurant.email === email.toLowerCase().trim()) {
      return errorResponse(res, 400, 'Restaurant with this email already exists. Please login.');
    }
    if (normalizedPhone && existingRestaurant.phone === normalizedPhone) {
      return errorResponse(res, 400, 'Restaurant with this phone number already exists. Please login.');
    }
  }

  // Create new restaurant
  const restaurantData = {
    name,
    email: email.toLowerCase().trim(),
    password, // Will be hashed by pre-save hook
    ownerName: ownerName || name,
    ownerEmail: (ownerEmail || email).toLowerCase().trim(),
    signupMethod: 'email',
    // Set isActive to false - restaurant needs admin approval before becoming active
    isActive: false,
    ...fcmPatch
  };

  // Only include phone if provided (don't set to null)
  if (normalizedPhone) {
    restaurantData.phone = normalizedPhone;
    restaurantData.ownerPhone = ownerPhone ? normalizePhoneNumber(ownerPhone) : normalizedPhone;
  }

  const restaurant = await Restaurant.create(restaurantData);

  // Generate tokens (email may be null for phone signups)
  const tokens = jwtService.generateTokens({
    userId: restaurant._id.toString(),
    role: 'restaurant',
    email: restaurant.email || restaurant.phone || restaurant.restaurantId
  });

  // Set refresh token in httpOnly cookie
  setRestaurantRefreshCookies(res, tokens.refreshToken);

  logger.info(`New restaurant registered via email: ${restaurant._id}`, { email, restaurantId: restaurant._id });

  return successResponse(res, 201, 'Registration successful', {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    restaurant: serializeRestaurantAuthPayload(restaurant)
  });
});

/**
 * Login restaurant with email and password
 * POST /api/restaurant/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  if (rejectIfGroceryPlatformRequest(req, res)) return;
  const { email, password } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  if (!email || !password) {
    return errorResponse(res, 400, 'Email and password are required');
  }

  const restaurant = await Restaurant.findOne(withRestaurantPlatformFilter({ email })).select('+password');

  if (!restaurant) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  if (!restaurant.isActive) {
    return errorResponse(res, 401, 'Restaurant account is inactive. Please contact support.');
  }

  // Check if restaurant has a password set
  if (!restaurant.password) {
    return errorResponse(res, 400, 'Account was created with phone. Please use OTP login.');
  }

  // Verify password
  const isPasswordValid = await restaurant.comparePassword(password);

  if (!isPasswordValid) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  if (fcmPatch.fcmTokenWeb) {
    restaurant.fcmTokenWeb = fcmPatch.fcmTokenWeb;
  }
  if (fcmPatch.fcmTokenMobile) {
    restaurant.fcmTokenMobile = fcmPatch.fcmTokenMobile;
  }
  if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile) {
    await restaurant.save();
  }

    // Generate tokens (email may be null for phone signups)
    const tokens = jwtService.generateTokens({
      userId: restaurant._id.toString(),
      role: 'restaurant',
      email: restaurant.email || restaurant.phone || restaurant.restaurantId
  });

  // Set refresh token in httpOnly cookie
  setRestaurantRefreshCookies(res, tokens.refreshToken);

  logger.info(`Restaurant logged in via email: ${restaurant._id}`, { email, restaurantId: restaurant._id });

  return successResponse(res, 200, 'Login successful', {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    restaurant: serializeRestaurantAuthPayload(restaurant)
  });
});

/**
 * Reset Password with OTP verification
 * POST /api/restaurant/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return errorResponse(res, 400, 'Email, OTP, and new password are required');
  }

  if (newPassword.length < 6) {
    return errorResponse(res, 400, 'Password must be at least 6 characters long');
  }

  const restaurant = await Restaurant.findOne(withRestaurantPlatformFilter({ email })).select('+password');

  if (!restaurant) {
    return errorResponse(res, 404, 'No restaurant account found with this email.');
  }

  // Verify OTP for reset-password purpose
  try {
    await otpService.verifyOTP(null, otp, 'reset-password', email);
  } catch (error) {
    logger.error(`OTP verification failed for password reset: ${error.message}`);
    return errorResponse(res, 400, 'Invalid or expired OTP. Please request a new one.');
  }

  // Update password
  restaurant.password = newPassword; // Will be hashed by pre-save hook
  await restaurant.save();

  logger.info(`Password reset successful for restaurant: ${restaurant._id}`, { email, restaurantId: restaurant._id });

  return successResponse(res, 200, 'Password reset successfully. Please login with your new password.');
});

/**
 * Refresh Access Token
 * POST /api/restaurant/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from cookie
  const refreshToken =
    req.cookies?.restaurantRefreshToken ||
    req.cookies?.refreshToken ||
    req.body?.refreshToken ||
    req.headers['x-refresh-token'];

  if (!refreshToken) {
    return errorResponse(res, 401, 'Refresh token not found');
  }

  try {
    // Verify refresh token
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    // Ensure it's a restaurant token
    if (decoded.role !== 'restaurant') {
      return errorResponse(res, 401, 'Invalid token for restaurant');
    }

    // Get restaurant from database
    const restaurant = await Restaurant.findById(decoded.userId).select('-password');

    if (!restaurant) {
      return errorResponse(res, 401, 'Restaurant not found');
    }
    if (restaurant.platform === 'mogrocery') {
      return errorResponse(res, 401, 'Invalid token for restaurant module');
    }

    // Allow inactive restaurants to refresh tokens - they need access to complete onboarding
    // The middleware will handle blocking inactive restaurants from accessing restricted routes

    // Generate new access token
    const accessToken = jwtService.generateAccessToken({
      userId: restaurant._id.toString(),
      role: 'restaurant',
      email: restaurant.email || restaurant.phone || restaurant.restaurantId
    });

    setRestaurantRefreshCookies(res, refreshToken);

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken,
      refreshToken
    });
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid refresh token');
  }
});

/**
 * Logout
 * POST /api/restaurant/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  if (req.restaurant) {
    req.restaurant.isAcceptingOrders = false;
    await req.restaurant.save();
  }

  // Clear refresh token cookie
  clearRestaurantRefreshCookies(res);

  return successResponse(res, 200, 'Logged out successfully');
});

const normalizeRestaurantOnboardingState = (restaurant) => {
  const onboarding = restaurant?.onboarding?.toObject
    ? restaurant.onboarding.toObject()
    : { ...(restaurant?.onboarding || {}) };

  const status = String(restaurant?.status || '').trim().toLowerCase();
  const isProvisioned =
    restaurant?.isActive === true ||
    Boolean(restaurant?.approvedAt) ||
    Boolean(restaurant?.rejectedAt) ||
    Boolean(String(restaurant?.rejectionReason || '').trim()) ||
    (status && status !== 'onboarding') ||
    Number(onboarding?.completedSteps || 0) >= 4;

  if (isProvisioned && Number(onboarding?.completedSteps || 0) < 4) {
    onboarding.completedSteps = 4;
  }

  return onboarding;
};

const serializeRestaurantAuthPayload = (restaurant) => ({
  id: restaurant._id,
  restaurantId: restaurant.restaurantId,
  name: restaurant.name,
  email: restaurant.email,
  phone: restaurant.phone,
  phoneVerified: restaurant.phoneVerified,
  signupMethod: restaurant.signupMethod,
  profileImage: restaurant.profileImage,
  isActive: restaurant.isActive,
  status: restaurant.status,
  onboarding: normalizeRestaurantOnboardingState(restaurant),
  ownerName: restaurant.ownerName,
  ownerEmail: restaurant.ownerEmail,
  ownerPhone: restaurant.ownerPhone,
  cuisines: restaurant.cuisines,
  openDays: restaurant.openDays,
  location: restaurant.location,
  primaryContactNumber: restaurant.primaryContactNumber,
  deliveryTimings: restaurant.deliveryTimings,
  menuImages: restaurant.menuImages,
  slug: restaurant.slug,
  rejectionReason: String(restaurant.rejectionReason || '').trim() || null,
  approvedAt: restaurant.approvedAt || null,
  rejectedAt: restaurant.rejectedAt || null
});

const isProvisionedRestaurant = (restaurant) => {
  const status = String(restaurant?.status || '').trim().toLowerCase();
  return (
    restaurant?.isActive === true ||
    Boolean(restaurant?.approvedAt) ||
    Boolean(restaurant?.rejectedAt) ||
    Boolean(String(restaurant?.rejectionReason || '').trim()) ||
    (status && status !== 'onboarding') ||
    Number(restaurant?.onboarding?.completedSteps || 0) >= 4
  );
};

/**
 * Find restaurant by primary auth phone deterministically across legacy formats.
 * This intentionally ignores owner/contact phone fields so phone-based auth only
 * resolves the outlet account that actually owns the login identity.
 */
const findRestaurantByNormalizedPhone = async (normalizedPhone) => {
  const phoneQuery = buildPhoneQuery(normalizedPhone);
  if (!phoneQuery) return null;

  const matches = await Restaurant.find(withRestaurantPlatformFilter(phoneQuery));
  const legacyQuery = buildLegacyPhoneFallbackQuery(normalizedPhone);
  const legacyMatches = legacyQuery
    ? await Restaurant.find(withRestaurantPlatformFilter(legacyQuery))
        .sort({ isActive: -1, approvedAt: -1, updatedAt: -1, createdAt: -1 })
        .limit(10)
    : [];

  const scoreMatch = (restaurant) => {
    let score = 0;
    const phone = String(restaurant?.phone || '').trim();
    const ownerPhone = String(restaurant?.ownerPhone || '').trim();
    const primaryContactNumber = String(restaurant?.primaryContactNumber || '').trim();
    const normalizedStatus = String(restaurant?.status || '').trim().toLowerCase();

    if (phone && normalizePhoneNumber(phone) === normalizedPhone) score += 100;
    if (phone === normalizedPhone) score += 120;
    if (ownerPhone && normalizePhoneNumber(ownerPhone) === normalizedPhone) score += 95;
    if (primaryContactNumber && normalizePhoneNumber(primaryContactNumber) === normalizedPhone) score += 90;
    if (restaurant?.phoneVerified) score += 10;
    if (normalizedStatus === 'active' || normalizedStatus === 'approved') score += 300;
    if (restaurant?.isActive) score += 250;
    if (restaurant?.approvedAt) score += 250;
    if (Number(restaurant?.onboarding?.completedSteps || 0) >= 4) score += 200;
    if (isProvisionedRestaurant(restaurant)) score += 400;
    if (!restaurant?.email && normalizedStatus === 'onboarding' && !restaurant?.isActive) score -= 200;

    return score;
  };

  const candidateMap = new Map();
  [...(matches || []), ...(legacyMatches || [])].forEach((restaurant) => {
    const id = String(restaurant?._id || '').trim();
    if (id) candidateMap.set(id, restaurant);
  });

  const candidates = [...candidateMap.values()];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => scoreMatch(b) - scoreMatch(a));
  const restaurant = candidates[0];

  // Self-heal legacy records so future phone logins resolve directly.
  if (!String(restaurant?.phone || '').trim() && isProvisionedRestaurant(restaurant)) {
    restaurant.phone = normalizedPhone;
    if (!restaurant.phoneVerified) {
      restaurant.phoneVerified = true;
    }
    if (!String(restaurant?.ownerPhone || '').trim()) {
      restaurant.ownerPhone = normalizedPhone;
    }
    try {
      await restaurant.save();
    } catch (error) {
      logger.warn('Failed to backfill primary phone during legacy restaurant login fallback', {
        restaurantId: restaurant?._id?.toString?.(),
        normalizedPhone,
        error: error?.message
      });
    }
  }

  return restaurant;
};

/**
 * Get current restaurant
 * GET /api/restaurant/auth/me
 */
export const getCurrentRestaurant = asyncHandler(async (req, res) => {
  const normalizedOnboarding = normalizeRestaurantOnboardingState(req.restaurant);
  const outletTimings = await OutletTimings.findOne({
    restaurantId: req.restaurant._id,
    isActive: true,
  }).lean();
  const isAcceptingOrdersFromTimings = outletTimings?.timings
    ? isOpenFromOutletTimings(outletTimings.timings)
    : true;
  const isAcceptingOrders = Boolean(req.restaurant.isAcceptingOrders !== false) && isAcceptingOrdersFromTimings;
  // Restaurant is attached by authenticate middleware
  return successResponse(res, 200, 'Restaurant retrieved successfully', {
    restaurant: {
      id: req.restaurant._id,
      restaurantId: req.restaurant.restaurantId,
      name: req.restaurant.name,
      email: req.restaurant.email,
      phone: req.restaurant.phone,
      phoneVerified: req.restaurant.phoneVerified,
      signupMethod: req.restaurant.signupMethod,
      profileImage: req.restaurant.profileImage,
      isActive: req.restaurant.isActive,
      status: req.restaurant.status,
      onboarding: normalizedOnboarding,
      ownerName: req.restaurant.ownerName,
      ownerEmail: req.restaurant.ownerEmail,
      ownerPhone: req.restaurant.ownerPhone,
      // Include additional restaurant details
      cuisines: req.restaurant.cuisines,
      openDays: req.restaurant.openDays,
      location: req.restaurant.location,
      primaryContactNumber: req.restaurant.primaryContactNumber,
      deliveryTimings: req.restaurant.deliveryTimings,
      menuImages: req.restaurant.menuImages,
      slug: req.restaurant.slug,
      isAcceptingOrders,
      // Include verification status
      rejectionReason: String(req.restaurant.rejectionReason || '').trim() || null,
      approvedAt: req.restaurant.approvedAt || null,
      rejectedAt: req.restaurant.rejectedAt || null
    }
  });
});

/**
 * Update FCM token for restaurant app notifications
 * POST /api/restaurant/auth/fcm-token
 */
export const updateFcmToken = asyncHandler(async (req, res) => {
  const { token, platform } = req.body;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return errorResponse(res, 400, 'FCM token is required');
  }

  const normalizedPlatform = String(platform || '').toLowerCase();
  if (!['web', 'mobile'].includes(normalizedPlatform)) {
    return errorResponse(res, 400, "Platform must be 'web' or 'mobile'");
  }

  const field = normalizedPlatform === 'web' ? 'fcmTokenWeb' : 'fcmTokenMobile';
  req.restaurant[field] = token.trim();
  await req.restaurant.save();

  return successResponse(res, 200, 'FCM token updated successfully', {
    fcmTokenWeb: req.restaurant.fcmTokenWeb || '',
    fcmTokenMobile: req.restaurant.fcmTokenMobile || ''
  });
});

/**
 * Reverify Restaurant (Resubmit for approval)
 * POST /api/restaurant/auth/reverify
 */
export const reverifyRestaurant = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant; // Already attached by authenticate middleware

    // Check if restaurant was rejected
    if (!String(restaurant.rejectionReason || '').trim()) {
      return errorResponse(res, 400, 'Restaurant is not rejected. Only rejected restaurants can be reverified.');
    }

    // Clear rejection details and mark as pending again
    restaurant.rejectionReason = null;
    restaurant.rejectedAt = null;
    restaurant.rejectedBy = null;
    restaurant.approvedAt = null;
    restaurant.approvedBy = null;
    restaurant.status = 'pending';
    restaurant.isActive = false; // Keep inactive until approved

    await restaurant.save();

    logger.info(`Restaurant reverified: ${restaurant._id}`, {
      restaurantName: restaurant.name
    });

    return successResponse(res, 200, 'Restaurant reverified successfully. Waiting for admin approval. Verification will be done in 24 hours.', {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
        rejectionReason: null
      }
    });
  } catch (error) {
    logger.error(`Error reverifying restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reverify restaurant');
  }
});

/**
 * Login / register using Firebase Google ID token
 * POST /api/restaurant/auth/firebase/google-login
 */
export const firebaseGoogleLogin = asyncHandler(async (req, res) => {
  if (rejectIfGroceryPlatformRequest(req, res)) return;
  const { idToken } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  if (!idToken) {
    return errorResponse(res, 400, 'Firebase ID token is required');
  }

  // Ensure Firebase Admin is configured
  if (!(await firebaseAuthService.isEnabled())) {
    return errorResponse(
      res,
      500,
      'Firebase Auth is not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Admin > ENV Setup'
    );
  }

  try {
    // Verify Firebase ID token
    const decoded = await firebaseAuthService.verifyIdToken(idToken);

    const firebaseUid = decoded.uid;
    const email = decoded.email || null;
    const name = decoded.name || decoded.display_name || 'Restaurant';
    const picture = decoded.picture || decoded.photo_url || null;
    const emailVerified = !!decoded.email_verified;

    // Validate email is present
    if (!email) {
      logger.error('Firebase Google login failed: Email not found in token', { uid: firebaseUid });
      return errorResponse(res, 400, 'Email not found in Firebase user. Please ensure email is available in your Google account.');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.error('Firebase Google login failed: Invalid email format', { email });
      return errorResponse(res, 400, 'Invalid email format received from Google.');
    }

    // Find existing restaurant by firebase UID (stored in googleId) or email
    let restaurant = await Restaurant.findOne(withRestaurantPlatformFilter({
      $or: [
        { googleId: firebaseUid },
        { email }
      ]
    }));

    if (restaurant) {
      // If restaurant exists but googleId not linked yet, link it
      if (!restaurant.googleId) {
        restaurant.googleId = firebaseUid;
        restaurant.googleEmail = email;
        if (!restaurant.profileImage && picture) {
          restaurant.profileImage = { url: picture };
        }
        if (!restaurant.signupMethod) {
          restaurant.signupMethod = 'google';
        }
        await restaurant.save();
        logger.info('Linked Google account to existing restaurant', { restaurantId: restaurant._id, email });
      }

      logger.info('Existing restaurant logged in via Firebase Google', {
        restaurantId: restaurant._id,
        email
      });
    } else {
      // Auto-register new restaurant based on Firebase data
      const restaurantData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        googleId: firebaseUid,
        googleEmail: email.toLowerCase().trim(),
        signupMethod: 'google',
        profileImage: picture ? { url: picture } : null,
        ownerName: name.trim(),
        ownerEmail: email.toLowerCase().trim(),
        // Set isActive to false - restaurant needs admin approval before becoming active
        isActive: false,
        ...fcmPatch
      };

      try {
        restaurant = await Restaurant.create(restaurantData);

        logger.info('New restaurant registered via Firebase Google login', {
          firebaseUid,
          email,
          restaurantId: restaurant._id,
          name: restaurant.name
        });
      } catch (createError) {
        // Handle duplicate key error
        if (createError.code === 11000) {
          logger.warn('Duplicate key error during restaurant creation, retrying find', { email });
          restaurant = await Restaurant.findOne(withRestaurantPlatformFilter({ email }));
          if (!restaurant) {
            logger.error('Restaurant not found after duplicate key error', { email });
            throw createError;
          }
          // Link Google ID if not already linked
          if (!restaurant.googleId) {
            restaurant.googleId = firebaseUid;
            restaurant.googleEmail = email;
            if (!restaurant.profileImage && picture) {
              restaurant.profileImage = { url: picture };
            }
            if (!restaurant.signupMethod) {
              restaurant.signupMethod = 'google';
            }
            await restaurant.save();
          }
        } else {
          logger.error('Error creating restaurant via Firebase Google login', { error: createError.message, email });
          throw createError;
        }
      }
    }

    // Ensure restaurant is active
    if (!restaurant.isActive) {
      logger.warn('Inactive restaurant attempted login', { restaurantId: restaurant._id, email });
      return errorResponse(res, 403, 'Your restaurant account has been deactivated. Please contact support.');
    }

    if (fcmPatch.fcmTokenWeb) {
      restaurant.fcmTokenWeb = fcmPatch.fcmTokenWeb;
    }
    if (fcmPatch.fcmTokenMobile) {
      restaurant.fcmTokenMobile = fcmPatch.fcmTokenMobile;
    }
    if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile) {
      await restaurant.save();
    }

    // Generate JWT tokens for our app (email may be null for phone signups)
    const tokens = jwtService.generateTokens({
      userId: restaurant._id.toString(),
      role: 'restaurant',
      email: restaurant.email || restaurant.phone || restaurant.restaurantId
    });

    // Set refresh token in httpOnly cookie
    setRestaurantRefreshCookies(res, tokens.refreshToken);

    return successResponse(res, 200, 'Firebase Google authentication successful', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      restaurant: serializeRestaurantAuthPayload(restaurant)
    });
  } catch (error) {
    logger.error(`Error in Firebase Google login: ${error.message}`);
    return errorResponse(res, 400, error.message || 'Firebase Google authentication failed');
  }
});




