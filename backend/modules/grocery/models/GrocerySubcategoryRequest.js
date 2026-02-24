import mongoose from 'mongoose';

const grocerySubcategoryRequestSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Store ID is required'],
      index: true,
    },
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
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    createdSubcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GrocerySubcategory',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

grocerySubcategoryRequestSchema.index({ storeId: 1, approvalStatus: 1 });
grocerySubcategoryRequestSchema.index({ category: 1, approvalStatus: 1 });
grocerySubcategoryRequestSchema.index({ approvalStatus: 1, createdAt: -1 });

const GrocerySubcategoryRequest = mongoose.model('GrocerySubcategoryRequest', grocerySubcategoryRequestSchema);

export default GrocerySubcategoryRequest;
