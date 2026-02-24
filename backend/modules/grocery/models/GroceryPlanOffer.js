import mongoose from 'mongoose';

const objectIdArray = [{ type: mongoose.Schema.Types.ObjectId }];

const groceryPlanOfferSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 80,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    discountType: {
      type: String,
      enum: ['none', 'flat', 'percentage'],
      default: 'none',
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    categoryDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    subcategoryDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    productDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    freeDelivery: {
      type: Boolean,
      default: false,
    },
    planIds: {
      type: objectIdArray,
      ref: 'GroceryPlan',
      default: [],
    },
    productIds: {
      type: objectIdArray,
      ref: 'GroceryProduct',
      default: [],
    },
    categoryIds: {
      type: objectIdArray,
      ref: 'GroceryCategory',
      default: [],
    },
    subcategoryIds: {
      type: objectIdArray,
      ref: 'GrocerySubcategory',
      default: [],
    },
    validFrom: {
      type: Date,
      default: null,
    },
    validTill: {
      type: Date,
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

groceryPlanOfferSchema.index({ isActive: 1, order: 1, createdAt: -1 });
groceryPlanOfferSchema.index({ planIds: 1, isActive: 1 });

export default mongoose.model('GroceryPlanOffer', groceryPlanOfferSchema);
