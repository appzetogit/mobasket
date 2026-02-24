import mongoose from 'mongoose';

const top10RestaurantSchema = new mongoose.Schema({
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
  rank: {
    type: Number,
    required: true,
    min: 1,
    max: 10
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
top10RestaurantSchema.index({ platform: 1, rank: 1 }, { unique: true });
top10RestaurantSchema.index({ platform: 1, restaurant: 1 }, { unique: true });
top10RestaurantSchema.index({ platform: 1, rank: 1, isActive: 1 });
top10RestaurantSchema.index({ platform: 1, order: 1, isActive: 1 });

// Ensure only 10 restaurants can be active
top10RestaurantSchema.pre('save', async function(next) {
  if (this.isActive && this.isNew) {
    const activeCount = await mongoose.model('Top10Restaurant').countDocuments({ platform: this.platform, isActive: true });
    if (activeCount >= 10) {
      return next(new Error('Maximum 10 restaurants can be active in Top 10'));
    }
  }
  // If activating an existing restaurant, check count excluding current document
  if (this.isActive && !this.isNew && this.isModified('isActive')) {
    const activeCount = await mongoose.model('Top10Restaurant').countDocuments({ 
      platform: this.platform,
      isActive: true, 
      _id: { $ne: this._id } 
    });
    if (activeCount >= 10) {
      return next(new Error('Maximum 10 restaurants can be active in Top 10'));
    }
  }
  next();
});

export default mongoose.model('Top10Restaurant', top10RestaurantSchema);

