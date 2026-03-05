import mongoose from 'mongoose';

const mofoodProductSectionItemSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ['mofood', 'mogrocery'],
      default: 'mofood',
      index: true,
    },
    sectionName: {
      type: String,
      required: true,
      trim: true,
    },
    sectionOrder: {
      type: Number,
      default: 0,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    menuItemId: {
      type: String,
      required: true,
      trim: true,
    },
    menuItemName: {
      type: String,
      default: '',
      trim: true,
    },
    menuItemImage: {
      type: String,
      default: '',
      trim: true,
    },
    menuItemPrice: {
      type: Number,
      default: 0,
    },
    menuItemOriginalPrice: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

mofoodProductSectionItemSchema.index({ platform: 1, sectionOrder: 1, sectionName: 1, order: 1, isActive: 1 });
mofoodProductSectionItemSchema.index({ platform: 1, restaurantId: 1, menuItemId: 1 }, { unique: true });

export default mongoose.model('MofoodProductSectionItem', mofoodProductSectionItemSchema);
