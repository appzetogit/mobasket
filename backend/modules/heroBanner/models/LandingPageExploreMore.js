import mongoose from 'mongoose';

const landingPageExploreMoreSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['mofood', 'mogrocery'],
    default: 'mofood',
    index: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  link: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    required: true,
    trim: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true,
    trim: true
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

// Index for ordering
landingPageExploreMoreSchema.index({ platform: 1, order: 1, isActive: 1 });

export default mongoose.model('LandingPageExploreMore', landingPageExploreMoreSchema);

