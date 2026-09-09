import mongoose from 'mongoose';
import ContactMessage from '../models/ContactMessage.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * Submit a contact enquiry (public)
 * POST /api/contact
 */
export const submitContactMessage = asyncHandler(async (req, res) => {
  try {
    const name = clean(req.body?.name, 120);
    const message = clean(req.body?.message, 4000);
    const email = clean(req.body?.email, 200).toLowerCase();
    const phone = clean(req.body?.phone, 20);

    if (!name) return errorResponse(res, 400, 'Name is required');
    if (!message) return errorResponse(res, 400, 'Message is required');

    // At least one way to reply, otherwise the enquiry is a dead end.
    if (!email && !phone) {
      return errorResponse(res, 400, 'Provide an email address or a phone number');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse(res, 400, 'Email address is not valid');
    }

    const created = await ContactMessage.create({
      name,
      email,
      phone,
      subject: clean(req.body?.subject, 200),
      message,
      // Populated by optional auth when the sender happens to be signed in.
      userId: req.user?._id || null,
    });

    // Deliberately minimal: the caller is unauthenticated, so nothing about the
    // stored record beyond its id is echoed back.
    return successResponse(res, 201, 'Thanks for getting in touch. We will respond shortly.', {
      id: created._id,
    });
  } catch (error) {
    console.error('Error submitting contact message:', error);
    return errorResponse(res, 500, 'Failed to submit your message');
  }
});

/**
 * List contact enquiries (admin)
 * GET /api/admin/contact-messages?status=New&page=1&limit=25&search=
 */
export const getContactMessages = asyncHandler(async (req, res) => {
  try {
    const { status, search } = req.query || {};
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));

    const filter = {};
    if (status && ['New', 'In Progress', 'Resolved'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { subject: rx }];
    }

    // Counted and paged in the database so the inbox stays cheap as it grows.
    const [messages, total, statusCounts] = await Promise.all([
      ContactMessage.find(filter)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ContactMessage.countDocuments(filter),
      ContactMessage.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);

    const counts = { New: 0, 'In Progress': 0, Resolved: 0 };
    for (const row of statusCounts) {
      if (row._id in counts) counts[row._id] = row.n;
    }

    return successResponse(res, 200, 'Contact messages retrieved successfully', {
      messages,
      counts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    return errorResponse(res, 500, 'Failed to fetch contact messages');
  }
});

/**
 * Update an enquiry's status or internal note (admin)
 * PATCH /api/admin/contact-messages/:id
 */
export const updateContactMessage = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid id');
    }

    const { status, adminNote } = req.body || {};
    const update = {};

    if (status !== undefined) {
      if (!['New', 'In Progress', 'Resolved'].includes(status)) {
        return errorResponse(res, 400, 'Status must be New, In Progress or Resolved');
      }
      update.status = status;
      update.handledBy = req.admin?._id || null;
      update.handledAt = new Date();
    }
    if (adminNote !== undefined) {
      update.adminNote = clean(adminNote, 2000);
    }

    if (Object.keys(update).length === 0) {
      return errorResponse(res, 400, 'Nothing to update');
    }

    const updated = await ContactMessage.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!updated) {
      return errorResponse(res, 404, 'Message not found');
    }

    return successResponse(res, 200, 'Contact message updated successfully', { message: updated });
  } catch (error) {
    console.error('Error updating contact message:', error);
    return errorResponse(res, 500, 'Failed to update contact message');
  }
});

/**
 * Delete an enquiry (admin)
 * DELETE /api/admin/contact-messages/:id
 */
export const deleteContactMessage = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid id');
    }

    const deleted = await ContactMessage.findByIdAndDelete(id).lean();
    if (!deleted) {
      return errorResponse(res, 404, 'Message not found');
    }

    return successResponse(res, 200, 'Contact message deleted successfully', { id });
  } catch (error) {
    console.error('Error deleting contact message:', error);
    return errorResponse(res, 500, 'Failed to delete contact message');
  }
});
