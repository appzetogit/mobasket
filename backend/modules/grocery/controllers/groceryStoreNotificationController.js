import mongoose from 'mongoose';
import RestaurantNotification from '../../restaurant/models/RestaurantNotification.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';

export const getStoreNotifications = asyncHandler(async (req, res) => {
  const storeId = req.store?._id;

  const notifications = await RestaurantNotification.find({ restaurant: storeId })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return successResponse(res, 200, 'Notifications fetched successfully', {
    notifications,
  });
});

export const deleteStoreNotification = asyncHandler(async (req, res) => {
  const storeId = req.store?._id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponse(res, 400, 'Invalid notification id');
  }

  const deleted = await RestaurantNotification.findOneAndDelete({
    _id: id,
    restaurant: storeId,
  });

  if (!deleted) {
    return errorResponse(res, 404, 'Notification not found');
  }

  return successResponse(res, 200, 'Notification deleted successfully');
});

export const clearStoreNotifications = asyncHandler(async (req, res) => {
  const storeId = req.store?._id;

  const result = await RestaurantNotification.deleteMany({ restaurant: storeId });

  return successResponse(res, 200, 'All notifications cleared successfully', {
    deletedCount: result.deletedCount || 0,
  });
});
