import mongoose from 'mongoose';

const gourmetRestaurantSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['mofood', 'mogrocery'],
    default: 'mofood',
    index: true
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
gourmetRestaurantSchema.index({ platform: 1, restaurant: 1 }, { unique: true });
gourmetRestaurantSchema.index({ platform: 1, order: 1, isActive: 1 });
gourmetRestaurantSchema.index({ platform: 1, restaurant: 1, isActive: 1 });

export default mongoose.model('GourmetRestaurant', gourmetRestaurantSchema);

