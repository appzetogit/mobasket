import mongoose from 'mongoose';

const deliveryFeeRangeSchema = new mongoose.Schema({
  min: {
    type: Number,
    required: true,
    min: 0,
  },
  max: {
    type: Number,
    required: true,
    min: 0,
  },
  fee: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const feeSettingsSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ['mofood', 'mogrocery'],
      default: 'mofood',
      index: true,
    },
    deliveryFee: {
      type: Number,
      default: 25,
      min: 0,
      comment: 'Default delivery fee (used if no range matches)'
    },
    deliveryFeeRanges: {
      type: [deliveryFeeRangeSchema],
      default: [],
      comment: 'Delivery fee based on order value ranges'
    },
    freeDeliveryThreshold: {
      type: Number,
      default: 149,
      min: 0,
      comment: 'Free delivery if order value is above this amount'
    },
    platformFee: {
      type: Number,
      required: [true, 'Platform fee is required'],
      default: 5,
      min: 0,
    },
    gstRate: {
      type: Number,
      required: [true, 'GST rate is required'],
      default: 5, // 5% GST
      min: 0,
      max: 100,
      comment: 'GST rate in percentage (e.g., 5 for 5%)'
    },
    minimumCodOrderValue: {
      type: Number,
      default: 0,
      min: 0,
      comment: 'Minimum cart total required to allow Cash on Delivery'
    },
    driverEarningRangeStartKm: {
      type: Number,
      default: 0,
      min: 0,
      comment: 'Start of base earning distance slab in KM'
    },
    driverEarningRangeEndKm: {
      type: Number,
      default: 2,
      min: 0,
      comment: 'End of base earning distance slab in KM'
    },
    driverEarningBaseAmount: {
      type: Number,
      default: 20,
      min: 0,
      comment: 'Fixed earning for distance within configured slab'
    },
    driverEarningExtraPerKm: {
      type: Number,
      default: 5,
      min: 0,
      comment: 'Extra earning per KM beyond slab end'
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
feeSettingsSchema.index({ platform: 1, isActive: 1 });
feeSettingsSchema.index({ createdAt: -1 });

const FeeSettings = mongoose.model('FeeSettings', feeSettingsSchema);

export default FeeSettings;

