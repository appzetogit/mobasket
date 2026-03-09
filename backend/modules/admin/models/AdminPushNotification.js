import mongoose from 'mongoose';

const adminPushNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    zone: {
      type: String,
      default: 'All',
      trim: true,
    },
    sendTo: {
      type: String,
      enum: ['Customer', 'All', 'Restaurant', 'Store'],
      default: 'Customer',
    },
    platform: {
      type: String,
      enum: ['all', 'mofood', 'mogrocery'],
      default: 'all',
      index: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

adminPushNotificationSchema.index({ createdAt: -1 });

export default mongoose.model('AdminPushNotification', adminPushNotificationSchema);
