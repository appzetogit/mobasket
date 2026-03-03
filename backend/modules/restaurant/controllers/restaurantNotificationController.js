import mongoose from 'mongoose';
import RestaurantNotification from '../models/RestaurantNotification.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id;

  const notifications = await RestaurantNotification.find({ restaurant: restaurantId })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return successResponse(res, 200, 'Notifications fetched successfully', {
    notifications,
  });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponse(res, 400, 'Invalid notification id');
  }

  const deleted = await RestaurantNotification.findOneAndDelete({
    _id: id,
    restaurant: restaurantId,
  });

  if (!deleted) {
    return errorResponse(res, 404, 'Notification not found');
  }

  return successResponse(res, 200, 'Notification deleted successfully');
});

export const clearNotifications = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id;

  const result = await RestaurantNotification.deleteMany({ restaurant: restaurantId });

  return successResponse(res, 200, 'All notifications cleared successfully', {
    deletedCount: result.deletedCount || 0,
  });
});
