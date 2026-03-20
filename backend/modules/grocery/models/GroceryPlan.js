import mongoose from 'mongoose';

const groceryPlanProductSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryProduct',
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    qty: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    image: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2048,
    },
  },
  { _id: false }
);

const groceryPlanZoneStoreRuleSchema = new mongoose.Schema(
  {
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      required: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryStore',
      required: true,
    },
    subcategoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GrocerySubcategory' }],
      default: [],
    },
  },
  { _id: false }
);

const groceryPlanSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 60,
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
      maxlength: 400,
    },
    itemsLabel: {
      type: String,
      trim: true,
      default: '',
      maxlength: 60,
    },
    productCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveries: {
      type: Number,
      default: 0,
      min: 0,
    },
    frequency: {
      type: String,
      trim: true,
      default: '',
      maxlength: 40,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },
    iconKey: {
      type: String,
      enum: ['zap', 'check', 'star', 'crown'],
      default: 'zap',
    },
    color: {
      type: String,
      trim: true,
      default: 'bg-emerald-500',
    },
    headerColor: {
      type: String,
      trim: true,
      default: 'bg-emerald-500',
    },
    popular: {
      type: Boolean,
      default: false,
    },
    benefits: {
      type: [String],
      default: [],
    },
    products: {
      type: [groceryPlanProductSchema],
      default: [],
    },
    vegProducts: {
      type: [groceryPlanProductSchema],
      default: [],
    },
    nonVegProducts: {
      type: [groceryPlanProductSchema],
      default: [],
    },
    offerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GroceryPlanOffer' }],
      default: [],
    },
    zoneIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
      default: [],
    },
    zoneStoreRules: {
      type: [groceryPlanZoneStoreRuleSchema],
      default: [],
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
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

groceryPlanSchema.index({ isActive: 1, order: 1 });
groceryPlanSchema.index({ order: 1, createdAt: -1 });

export default mongoose.model('GroceryPlan', groceryPlanSchema);
