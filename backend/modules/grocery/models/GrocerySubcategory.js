import mongoose from 'mongoose';

const grocerySubcategorySchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryCategory',
      required: [true, 'Category is required'],
    },
    name: {
      type: String,
      required: [true, 'Subcategory name is required'],
      trim: true,
      maxlength: [120, 'Subcategory name cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Subcategory slug is required'],
      trim: true,
      lowercase: true,
      maxlength: [140, 'Subcategory slug cannot exceed 140 characters'],
    },
    image: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
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

grocerySubcategorySchema.index({ category: 1, order: 1 });
grocerySubcategorySchema.index({ category: 1, name: 1 }, { unique: true });
grocerySubcategorySchema.index({ category: 1, slug: 1 }, { unique: true });
grocerySubcategorySchema.index({ isActive: 1, order: 1 });

const GrocerySubcategory = mongoose.model('GrocerySubcategory', grocerySubcategorySchema);

export default GrocerySubcategory;
