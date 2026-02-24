import mongoose from 'mongoose';

const groceryBestSellerSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ['mofood', 'mogrocery'],
      default: 'mogrocery',
      index: true,
    },
    itemType: {
      type: String,
      enum: ['category', 'subcategory', 'product'],
      required: true,
    },
    itemModel: {
      type: String,
      enum: ['GroceryCategory', 'GrocerySubcategory', 'GroceryProduct'],
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'itemModel',
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

groceryBestSellerSchema.index({ platform: 1, order: 1, isActive: 1 });
groceryBestSellerSchema.index({ platform: 1, itemType: 1, itemId: 1 }, { unique: true });

export default mongoose.model('GroceryBestSeller', groceryBestSellerSchema);
