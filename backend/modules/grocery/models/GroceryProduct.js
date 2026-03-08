import mongoose from 'mongoose';

const groceryProductVariantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Variant name is required'],
      trim: true,
      maxlength: [120, 'Variant name cannot exceed 120 characters'],
    },
    mrp: {
      type: Number,
      min: [0, 'Variant MRP cannot be negative'],
      required: [true, 'Variant MRP is required'],
    },
    sellingPrice: {
      type: Number,
      min: [0, 'Variant selling price cannot be negative'],
      required: [true, 'Variant selling price is required'],
    },
    stockQuantity: {
      type: Number,
      min: [0, 'Variant stock quantity cannot be negative'],
      default: 0,
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  }
);

const groceryProductSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryCategory',
      required: [true, 'Category is required'],
    },
    // Legacy single-subcategory field kept for backward compatibility.
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GrocerySubcategory',
      default: null,
    },
    subcategories: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'GrocerySubcategory',
        },
      ],
      default: [],
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [180, 'Product name cannot exceed 180 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      trim: true,
      lowercase: true,
      maxlength: [200, 'Product slug cannot exceed 200 characters'],
    },
    images: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    mrp: {
      type: Number,
      min: [0, 'MRP cannot be negative'],
      required: [true, 'MRP is required'],
    },
    sellingPrice: {
      type: Number,
      min: [0, 'Selling price cannot be negative'],
      required: [true, 'Selling price is required'],
    },
    unit: {
      type: String,
      trim: true,
      default: '',
    },
    variants: {
      type: [groceryProductVariantSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    stockQuantity: {
      type: Number,
      min: [0, 'Stock quantity cannot be negative'],
      default: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryStore',
      default: null,
      index: true,
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
    requestedCategory: {
      name: {
        type: String,
        trim: true,
        default: '',
      },
      slug: {
        type: String,
        trim: true,
        lowercase: true,
        default: '',
      },
    },
    requestedSubcategories: {
      type: [
        {
          name: {
            type: String,
            trim: true,
            default: '',
          },
          slug: {
            type: String,
            trim: true,
            lowercase: true,
            default: '',
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

groceryProductSchema.index({ category: 1, subcategories: 1, isActive: 1, order: 1 });
groceryProductSchema.index({ category: 1, order: 1 });
groceryProductSchema.index({ subcategories: 1, order: 1 });
groceryProductSchema.index({ storeId: 1, category: 1 });
groceryProductSchema.index({ storeId: 1, isActive: 1 });
groceryProductSchema.index({ approvalStatus: 1, isActive: 1 });
groceryProductSchema.index({ storeId: 1, approvalStatus: 1 });
groceryProductSchema.index({ storeId: 1, slug: 1 }, { unique: true }); // Unique slug per store

const GroceryProduct = mongoose.model('GroceryProduct', groceryProductSchema);

export default GroceryProduct;
