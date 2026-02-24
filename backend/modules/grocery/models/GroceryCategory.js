import mongoose from 'mongoose';

const groceryCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [120, 'Category name cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: [140, 'Category slug cannot exceed 140 characters'],
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
    section: {
      type: String,
      trim: true,
      default: 'Grocery & Kitchen',
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

groceryCategorySchema.index({ isActive: 1, order: 1 });
groceryCategorySchema.index({ section: 1, order: 1 });

const GroceryCategory = mongoose.model('GroceryCategory', groceryCategorySchema);

export default GroceryCategory;
