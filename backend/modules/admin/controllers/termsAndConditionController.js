import TermsAndCondition from '../models/TermsAndCondition.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Get Terms and Condition (Public)
 * GET /api/terms/public
 */
export const getTermsPublic = asyncHandler(async (req, res) => {
  try {
    const requestedAudience = String(req.query.audience || '').trim().toLowerCase();
    const validAudiences = ['user', 'restaurant', 'delivery'];
    const audience = validAudiences.includes(requestedAudience) ? requestedAudience : null;

    const terms = await TermsAndCondition.findOne({ isActive: true })
      .select('-updatedBy -createdAt -updatedAt -__v')
      .lean();

    if (!terms) {
      // Return default data if no terms exists
      return successResponse(res, 200, 'Terms and conditions retrieved successfully', {
        title: 'Terms and Conditions',
        content: '<p>No terms and conditions available at the moment.</p>',
        visibleOn: ['user', 'restaurant', 'delivery']
      });
    }

    const visibleOn = Array.isArray(terms.visibleOn) && terms.visibleOn.length > 0
      ? terms.visibleOn
      : ['user', 'restaurant', 'delivery'];

    if (audience && !visibleOn.includes(audience)) {
      return successResponse(res, 200, 'Terms and conditions are disabled for this audience', {
        title: terms.title || 'Terms and Conditions',
        content: '<p>Terms and conditions are not available for this login.</p>',
        visibleOn,
        isVisibleForAudience: false
      });
    }

    return successResponse(res, 200, 'Terms and conditions retrieved successfully', {
      ...terms,
      visibleOn,
      isVisibleForAudience: true
    });
  } catch (error) {
    console.error('Error fetching terms and conditions:', error);
    return errorResponse(res, 500, 'Failed to fetch terms and conditions');
  }
});

/**
 * Get Terms and Condition (Admin)
 * GET /api/admin/terms
 */
export const getTerms = asyncHandler(async (req, res) => {
  try {
    let terms = await TermsAndCondition.findOne({ isActive: true }).lean();

    if (!terms) {
      // Create default terms if it doesn't exist
      terms = await TermsAndCondition.create({
        title: 'Terms and Conditions',
        content: '<p>This is a test Terms & Conditions</p><p><strong>Terms of Use</strong></p><p>This Terms of Use ("Terms") applies to your access to and use of the website and the mobile application (collectively, the "Platform"). Please read these Terms carefully.</p>',
        visibleOn: ['user', 'restaurant', 'delivery'],
        updatedBy: req.admin._id
      });
    }

    return successResponse(res, 200, 'Terms and conditions retrieved successfully', terms);
  } catch (error) {
    console.error('Error fetching terms and conditions:', error);
    return errorResponse(res, 500, 'Failed to fetch terms and conditions');
  }
});

/**
 * Update Terms and Condition
 * PUT /api/admin/terms
 */
export const updateTerms = asyncHandler(async (req, res) => {
  try {
    const { title, content, visibleOn } = req.body;

    // Validate required fields
    if (!content) {
      return errorResponse(res, 400, 'Content is required');
    }

    // Find existing terms or create new one
    let terms = await TermsAndCondition.findOne({ isActive: true });
    const validAudiences = ['user', 'restaurant', 'delivery'];
    const normalizedVisibleOn = Array.isArray(visibleOn)
      ? visibleOn.filter((item) => validAudiences.includes(String(item).toLowerCase())).map((item) => String(item).toLowerCase())
      : null;

    if (!terms) {
      terms = new TermsAndCondition({
        title: title || 'Terms and Conditions',
        content,
        visibleOn: normalizedVisibleOn && normalizedVisibleOn.length > 0 ? normalizedVisibleOn : ['user', 'restaurant', 'delivery'],
        updatedBy: req.admin._id
      });
    } else {
      if (title !== undefined) terms.title = title;
      terms.content = content;
      if (normalizedVisibleOn) {
        terms.visibleOn = normalizedVisibleOn.length > 0 ? normalizedVisibleOn : ['user', 'restaurant', 'delivery'];
      }
      terms.updatedBy = req.admin._id;
    }

    await terms.save();

    return successResponse(res, 200, 'Terms and conditions updated successfully', terms);
  } catch (error) {
    console.error('Error updating terms and conditions:', error);
    return errorResponse(res, 500, 'Failed to update terms and conditions');
  }
});

