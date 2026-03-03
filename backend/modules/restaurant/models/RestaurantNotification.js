import mongoose from 'mongoose';

const restaurantNotificationSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['new_order', 'order_status', 'system'],
      default: 'system',
      index: true,
    },
    orderId: { type: String, default: '', trim: true },
    orderMongoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

restaurantNotificationSchema.index({ restaurant: 1, createdAt: -1 });

export default mongoose.model('RestaurantNotification', restaurantNotificationSchema);
