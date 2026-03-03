import mongoose from 'mongoose';

const groceryCategoryRequestSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryStore',
      required: [true, 'Store ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [120, 'Category name cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
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
    createdCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryCategory',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

groceryCategoryRequestSchema.index({ storeId: 1, approvalStatus: 1 });
groceryCategoryRequestSchema.index({ approvalStatus: 1, createdAt: -1 });

const GroceryCategoryRequest = mongoose.model('GroceryCategoryRequest', groceryCategoryRequestSchema);

export default GroceryCategoryRequest;
